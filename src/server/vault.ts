import "server-only";
import { decodeEventLog, getAddress, type Address, type Hash, type Log } from "viem";
import { vaultAbi, VAULT_ADDRESS, VAULT_DEPLOY_BLOCK } from "@/lib/contracts/vault";
import { publicEnv } from "@/lib/env";
import { launchUnits } from "@/lib/math";
import type { AssetPriceRow, AssetRow, StackComponent, StackMetadataRow } from "@/lib/supabase/types";
import { publicClient } from "@/server/chain";
import { db, must } from "@/server/db";

export function vaultAddress(): Address | null {
  const fromEnv = publicEnv().NEXT_PUBLIC_VAULT_ADDRESS;
  return VAULT_ADDRESS ?? (fromEnv ? getAddress(fromEnv) : null);
}

export function requireVault(): Address {
  const v = vaultAddress();
  if (!v) throw new Error("Vault not deployed yet");
  return v;
}

// ---------------------------------------------------------------------------
// Reads (chain is the source of truth)
// ---------------------------------------------------------------------------

export type ChainStack = {
  id: number;
  creator: Address;
  createdAt: number;
  metadataURI: string;
  tickerHash: `0x${string}`;
  assets: Address[];
  weightsBps: number[];
};

export async function readStack(id: number): Promise<ChainStack | null> {
  try {
    const [creator, createdAt, metadataURI, tickerHash, assets, weights] = await publicClient().readContract({
      address: requireVault(),
      abi: vaultAbi,
      functionName: "getStack",
      args: [BigInt(id)],
    });
    return {
      id,
      creator,
      createdAt: Number(createdAt),
      metadataURI,
      tickerHash,
      assets: [...assets],
      weightsBps: weights.map(Number),
    };
  } catch {
    return null; // UnknownStack
  }
}

export type ChainPosition = {
  id: number;
  stackId: number;
  openedAt: number;
  owner: Address | null;
  assets: Address[];
  balances: bigint[];
  feeReceiptId: number;
};

export async function readPosition(id: number): Promise<ChainPosition | null> {
  const pc = publicClient();
  const vault = requireVault();
  const [[stackId, openedAt, owner, assets, balances], pos] = await Promise.all([
    pc.readContract({ address: vault, abi: vaultAbi, functionName: "getPosition", args: [BigInt(id)] }),
    pc.readContract({ address: vault, abi: vaultAbi, functionName: "positions", args: [BigInt(id)] }),
  ]);
  if (stackId === 0n) return null;
  return {
    id,
    stackId: Number(stackId),
    openedAt: Number(openedAt),
    owner: owner === "0x0000000000000000000000000000000000000000" ? null : owner,
    assets: [...assets],
    balances: [...balances],
    feeReceiptId: Number(pos[2]),
  };
}

export async function readPositionsOf(owner: Address): Promise<ChainPosition[]> {
  const ids = await publicClient().readContract({
    address: requireVault(),
    abi: vaultAbi,
    functionName: "positionsOf",
    args: [owner],
  });
  const out = await Promise.all(ids.map((id) => readPosition(Number(id))));
  return out.filter((p): p is ChainPosition => p !== null);
}

export async function readCreatorClaimable(creator: Address): Promise<bigint> {
  return publicClient().readContract({ address: requireVault(), abi: vaultAbi, functionName: "creatorClaimable", args: [creator] });
}

export async function readFeeReceipt(id: number) {
  const [payer, stackId, grossAmount, used] = await publicClient().readContract({
    address: requireVault(),
    abi: vaultAbi,
    functionName: "feeReceipts",
    args: [BigInt(id)],
  });
  return { payer, stackId: Number(stackId), grossAmount, used };
}

// ---------------------------------------------------------------------------
// Event sync (BACKEND.md §5). Idempotent on (chain_id, tx_hash, log_index).
// ---------------------------------------------------------------------------

type Decoded = { eventName: string; args: Record<string, unknown> };

function jsonable(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(jsonable);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonable(x)]));
  return v;
}

async function profileIdByWallet(addr: string): Promise<string | null> {
  const p = must(await db().from("profiles").select("id").eq("wallet_address", addr.toLowerCase()).maybeSingle()) as { id: string } | null;
  return p?.id ?? null;
}

/** Insert the raw event; returns false if it was already processed. */
async function recordEvent(log: Log, d: Decoded): Promise<boolean> {
  const { data, error } = await db()
    .from("chain_events")
    .upsert(
      {
        chain_id: 56,
        tx_hash: log.transactionHash,
        log_index: log.logIndex,
        event: d.eventName,
        data: jsonable(d.args),
        block_number: Number(log.blockNumber),
      },
      { onConflict: "chain_id,tx_hash,log_index", ignoreDuplicates: true },
    )
    .select("tx_hash");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

async function onStackCreated(log: Log, a: Record<string, unknown>) {
  const id = Number(a.stackId as bigint);
  const creator = getAddress(a.creator as string);
  const assets = (a.assets as string[]).map((x) => getAddress(x));
  const weights = (a.weightsBps as number[]).map(Number);
  const metadataURI = a.metadataURI as string;
  const ticker = a.ticker as string;

  const assetRows = must(await db().from("assets").select("*").in("address", assets)) as AssetRow[];
  const byAddr = new Map(assetRows.map((r) => [r.address, r]));
  const components: StackComponent[] = assets.map((addr, i) => {
    const r = byAddr.get(addr);
    return {
      address: addr,
      provider: r?.provider ?? "bstock",
      ticker: r?.ticker ?? "?",
      symbol: r?.symbol ?? "?",
      weight_bps: weights[i]!,
    };
  });

  const prices = must(await db().from("asset_prices").select("*").in("address", assets)) as AssetPriceRow[];
  const priceBy = new Map(prices.map((p) => [p.address, p]));
  let units: string[] | null = null;
  try {
    units = launchUnits(
      weights,
      assets.map((x) => {
        const p = priceBy.get(x)?.price_usd;
        if (!p) throw new Error("missing price");
        return p;
      }),
    );
  } catch {
    units = null; // index starts once every component has a price (cron retries)
  }

  const meta = must(await db().from("stack_metadata").select("*").eq("metadata_uri", metadataURI).maybeSingle()) as StackMetadataRow | null;
  const creatorId = await profileIdByWallet(creator);

  must(
    await db()
      .from("stacks")
      .upsert(
        {
          id,
          creator_id: creatorId,
          creator_address: creator.toLowerCase(),
          ticker,
          name: meta?.name ?? ticker,
          description: meta?.description ?? null,
          image_url: meta?.image_url ?? null,
          metadata_uri: metadataURI,
          components,
          launch_units: units,
          tx_hash: log.transactionHash,
        },
        { onConflict: "id" },
      ),
  );
  if (meta?.telegram_url) {
    // Club link from the create form. Never overwrite one the creator has since edited.
    must(
      await db()
        .from("club_links")
        .upsert({ stack_id: id, telegram_url: meta.telegram_url, updated_by: meta.profile_id }, { onConflict: "stack_id", ignoreDuplicates: true }),
    );
  }
  if (units) {
    must(
      await db()
        .from("stack_index_points")
        .upsert({ stack_id: id, ts: new Date().toISOString(), value: 1000 }, { onConflict: "stack_id,ts", ignoreDuplicates: true }),
    );
  }
  if (creatorId) {
    await db()
      .from("activity")
      .upsert(
        { profile_id: creatorId, type: "create_stack", target_type: "stack", target_id: String(id), tx_hash: log.transactionHash },
        { onConflict: "tx_hash,type", ignoreDuplicates: true },
      );
  }
}

async function onPositionOpened(log: Log, a: Record<string, unknown>) {
  const owner = getAddress(a.owner as string);
  const profileId = await profileIdByWallet(owner);
  if (!profileId) return;
  const receipt = await readFeeReceipt(Number(a.feeReceiptId as bigint));
  await db()
    .from("activity")
    .upsert(
      {
        profile_id: profileId,
        type: "buy",
        target_type: "stack",
        target_id: String(a.stackId as bigint),
        usd_amount: Number(receipt.grossAmount) / 1e18,
        tx_hash: log.transactionHash,
      },
      { onConflict: "tx_hash,type", ignoreDuplicates: true },
    );
}

async function onPositionReleased(log: Log, a: Record<string, unknown>) {
  const owner = getAddress(a.owner as string);
  const profileId = await profileIdByWallet(owner);
  if (!profileId) return;
  const purpose = Number(a.purpose);
  const pos = must(
    await db().from("chain_events").select("data").eq("event", "PositionOpened").eq("data->>positionId", String(a.positionId as bigint)).maybeSingle(),
  ) as { data: { stackId: string } } | null;
  // Sells are recorded when proceeds are known (paySellFee); redeems here.
  if (purpose === 0) {
    await db()
      .from("activity")
      .upsert(
        { profile_id: profileId, type: "redeem", target_type: "stack", target_id: pos?.data.stackId ?? null, tx_hash: log.transactionHash },
        { onConflict: "tx_hash,type", ignoreDuplicates: true },
      );
  }
}

async function onSellFeePaid(log: Log, a: Record<string, unknown>) {
  const profileId = await profileIdByWallet(getAddress(a.payer as string));
  if (!profileId) return;
  const positionId = a.positionId as bigint;
  let target: { type: string; id: string | null } = { type: "asset", id: null };
  if (positionId > 0n) {
    const pos = must(
      await db().from("chain_events").select("data").eq("event", "PositionOpened").eq("data->>positionId", positionId.toString()).maybeSingle(),
    ) as { data: { stackId: string } } | null;
    target = { type: "stack", id: pos?.data.stackId ?? null };
  } else {
    const intent = must(
      await db().from("intents").select("asset_address").eq("sell_fee_tx_hash", log.transactionHash).maybeSingle(),
    ) as { asset_address: string | null } | null;
    target = { type: "asset", id: intent?.asset_address ?? null };
  }
  await db()
    .from("activity")
    .upsert(
      {
        profile_id: profileId,
        type: "sell",
        target_type: target.type,
        target_id: target.id,
        usd_amount: Number(a.proceeds as bigint) / 1e18,
        tx_hash: log.transactionHash,
      },
      { onConflict: "tx_hash,type", ignoreDuplicates: true },
    );
}

async function onCreatorClaimed(log: Log, a: Record<string, unknown>) {
  const profileId = await profileIdByWallet(getAddress(a.creator as string));
  if (!profileId) return;
  await db()
    .from("activity")
    .upsert(
      { profile_id: profileId, type: "claim", usd_amount: Number(a.amount as bigint) / 1e18, tx_hash: log.transactionHash },
      { onConflict: "tx_hash,type", ignoreDuplicates: true },
    );
}

async function processLog(log: Log) {
  let d: Decoded;
  try {
    d = decodeEventLog({ abi: vaultAbi, data: log.data, topics: log.topics }) as unknown as Decoded;
  } catch {
    return; // not a vault event we know (e.g. ERC-721 Transfer is in the ABI; others are skipped)
  }
  const fresh = await recordEvent(log, d);
  // Handlers are idempotent too, so re-running a processed log is safe; skipping saves work.
  if (!fresh && d.eventName !== "StackCreated") return;
  switch (d.eventName) {
    case "StackCreated":
      return onStackCreated(log, d.args);
    case "PositionOpened":
      return onPositionOpened(log, d.args);
    case "PositionReleased":
      return onPositionReleased(log, d.args);
    case "SellFeePaid":
      return onSellFeePaid(log, d.args);
    case "CreatorClaimed":
      return onCreatorClaimed(log, d.args);
  }
}

/** Process the vault logs of one transaction right after a user action. */
export async function syncTx(hash: Hash) {
  const vault = requireVault();
  const receipt = await publicClient().getTransactionReceipt({ hash });
  const logs = receipt.logs.filter((l) => getAddress(l.address) === vault);
  for (const l of logs) await processLog(l as Log);
  return { status: receipt.status, logs: logs.length, blockNumber: receipt.blockNumber };
}

/** Cron: read vault logs since the last synced block, adapting the range to RPC limits. */
export async function syncRange(maxBlocks = 5_000): Promise<{ from: bigint; to: bigint; logs: number }> {
  const vault = requireVault();
  const pc = publicClient();
  const state = must(await db().from("sync_state").select("last_block").eq("id", "vault").maybeSingle()) as { last_block: number } | null;
  const head = await pc.getBlockNumber();
  const start = state ? BigInt(state.last_block) + 1n : (VAULT_DEPLOY_BLOCK ?? head - 1_000n);
  const end = start + BigInt(maxBlocks) - 1n < head ? start + BigInt(maxBlocks) - 1n : head;
  if (start > end) return { from: start, to: end, logs: 0 };

  let from = start;
  let step = 2_000n;
  let count = 0;
  while (from <= end) {
    const to = from + step - 1n < end ? from + step - 1n : end;
    try {
      const logs = await pc.getLogs({ address: vault, fromBlock: from, toBlock: to });
      for (const l of logs) await processLog(l as Log);
      count += logs.length;
      must(await db().from("sync_state").upsert({ id: "vault", last_block: Number(to), updated_at: new Date().toISOString() }));
      from = to + 1n;
    } catch (e) {
      if (step <= 10n) throw e;
      step = step / 4n > 10n ? step / 4n : 10n; // provider range limits vary; shrink and retry
    }
  }
  return { from: start, to: end, logs: count };
}

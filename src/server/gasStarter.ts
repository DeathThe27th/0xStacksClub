import "server-only";
import { createWalletClient, formatEther, http, parseEther, parseUnits, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import { USDT_ADDRESS } from "@/lib/constants";
import { serverEnv } from "@/lib/env";
import { publicClient, readErc20Balances } from "./chain";
import { db, must } from "./db";
import { HttpError } from "./http";

/*
 * Gas starter. A wallet funded only with USDT (a card deposit, or a crypto deposit without BNB)
 * can't send its first transaction. Once per profile and once per wallet, ever, the app gifts a
 * little BNB to the user's own wallet so they can pay their own network fees from then on.
 *
 * Every trade is still signed and sent by the user's wallet; this only sends BNB, from a wallet
 * that holds nothing but the gift budget. Eligibility is read from chain, never from the client:
 * real USDT in the wallet, BNB below what one buy needs, no starter before, and a daily cap.
 */

/** USDT on BNB Chain has 18 decimals. A wallet needs this much to qualify. */
const MIN_USDT = parseUnits("5", 18);
/** Rough gas for one stock buy with its approvals; a wallet below this can't trade. */
const ONE_BUY_GAS = 800_000n;
const DEFAULT_AMOUNT = "0.0005";
const DEFAULT_DAILY_MAX = 100;

export type GasStarterStatus =
  | { available: false }
  | { available: true; eligible: true; amountBnb: string }
  | { available: true; eligible: false; reason: "claimed" | "has_gas" | "no_usdt" | "busy"; amountBnb: string };

function config() {
  const env = serverEnv();
  if (!env.GAS_STARTER_PRIVATE_KEY) return null;
  return {
    account: privateKeyToAccount(env.GAS_STARTER_PRIVATE_KEY as `0x${string}`),
    amount: parseEther(env.GAS_STARTER_BNB ?? DEFAULT_AMOUNT),
    dailyMax: env.GAS_STARTER_DAILY_MAX ?? DEFAULT_DAILY_MAX,
    rpc: env.BSC_RPC_URL,
  };
}

export async function gasStarterStatus(profileId: string, wallet: Address): Promise<GasStarterStatus> {
  const c = config();
  if (!c) return { available: false };
  const amountBnb = formatEther(c.amount);
  const pc = publicClient();

  const [claimed, dayCount, bnb, usdt, gasPrice, budget] = await Promise.all([
    db().from("gas_starters").select("id").or(`profile_id.eq.${profileId},wallet.eq.${wallet}`).limit(1),
    db()
      .from("gas_starters")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
    pc.getBalance({ address: wallet }),
    readErc20Balances(wallet, [USDT_ADDRESS]).then((m) => m.get(USDT_ADDRESS) ?? 0n),
    pc.getGasPrice(),
    pc.getBalance({ address: c.account.address }),
  ]);

  if ((must(claimed) ?? []).length) return { available: true, eligible: false, reason: "claimed", amountBnb };
  if (bnb >= gasPrice * ONE_BUY_GAS) return { available: true, eligible: false, reason: "has_gas", amountBnb };
  if (usdt < MIN_USDT) return { available: true, eligible: false, reason: "no_usdt", amountBnb };
  // Out of today's allowance, or the gift wallet itself is running dry.
  if ((dayCount.count ?? 0) >= c.dailyMax || budget < c.amount + gasPrice * 21_000n * 2n) return { available: true, eligible: false, reason: "busy", amountBnb };
  return { available: true, eligible: true, amountBnb };
}

/** Sends the starter if the wallet still qualifies. Returns the transfer's hash. */
export async function claimGasStarter(profileId: string, wallet: Address): Promise<{ txHash: Hash; amountBnb: string }> {
  const c = config();
  if (!c) throw new HttpError(404, "Gas starter isn't set up");
  const status = await gasStarterStatus(profileId, wallet);
  if (!status.available || !status.eligible) {
    const reason = status.available && !status.eligible ? status.reason : "unavailable";
    const message =
      reason === "claimed"
        ? "You've already had your free network fees"
        : reason === "has_gas"
          ? "Your wallet already has BNB for network fees"
          : reason === "no_usdt"
            ? "Deposit at least $5 of USDT first"
            : "Free network fees are paused right now. Try again later, or add a little BNB";
    throw new HttpError(409, message, reason);
  }

  // Claim the slot first: the unique keys mean a second request can't also pay out.
  const { data: row, error } = await db().from("gas_starters").insert({ profile_id: profileId, wallet, amount_wei: c.amount.toString() }).select("id").single();
  if (error || !row) throw new HttpError(409, "You've already had your free network fees", "claimed");

  try {
    const wc = createWalletClient({ account: c.account, chain: bsc, transport: http(c.rpc) });
    const txHash = await wc.sendTransaction({ to: wallet, value: c.amount });
    must(await db().from("gas_starters").update({ status: "sent", tx_hash: txHash }).eq("id", row.id));
    return { txHash, amountBnb: formatEther(c.amount) };
  } catch (e) {
    await db().from("gas_starters").delete().eq("id", row.id);
    console.error("gas starter send failed", e);
    throw new HttpError(503, "Couldn't send the network fees just now. Try again in a minute");
  }
}

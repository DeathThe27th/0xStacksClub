import { decodeFunctionData, erc20Abi, getAddress, type Address, type Hash } from "viem";
import { describe, expect, it } from "vitest";
import type { Intent, Leg } from "@/lib/client/types";
import { USDT_ADDRESS } from "@/lib/constants";
import { vaultAbi } from "@/lib/contracts/vault";
import { createRunner, StopError, type Backend, type QuoteResponse, type Signer } from "./runner";

const VAULT = getAddress("0x2a03793A4E00cD639F1811Fc2c0d3f14c78Aec17");
const ROUTER = getAddress("0x1111111111111111111111111111111111111111");
const WALLET = getAddress("0x2222222222222222222222222222222222222222");
const NVDA = getAddress("0x3333333333333333333333333333333333333333");
const MSFT = getAddress("0x4444444444444444444444444444444444444444");

type Sent = { to: Address; data: `0x${string}`; nonce?: number; gas?: bigint };

function leg(i: number, to: Address, amount: string): Leg {
  return { intent_id: "i", leg_index: i, from_token: USDT_ADDRESS, to_token: to, amount_in: amount, expected_out: null, min_out: null, actual_out: null, mode: null, order_id: null, tx_hash: null, status: "pending", error: null, attempt: 0 };
}

function buyIntent(kind: "buy_stock" | "buy_stack", legs: Leg[]): Intent {
  return { id: "i", kind, stack_id: kind === "buy_stack" ? 7 : null, position_id: null, asset_address: null, gross_amount: "1000", fee_amount: "10", bps: null, fee_receipt_id: null, released_amounts: null, status: "created", error: null, created_at: "", legs };
}

/** A pretend server and chain: keeps the intent, records what the wallet sent and in what order. */
function world(intent: Intent, opts: { approvals?: Backend["approvals"]; quote?: (legIndex: number, n: number) => QuoteResponse; reverted?: (tx: Sent, i: number) => boolean } = {}) {
  const sent: Sent[] = [];
  const log: string[] = [];
  const allowances = new Map<string, bigint>();
  const quotes = new Map<number, number>();
  const hashOf = (i: number) => `0x${String(i + 1).padStart(64, "0")}` as Hash;

  const signer: Signer = {
    address: WALLET,
    sendTransaction: async (tx) => {
      sent.push(tx);
      if (tx.data.startsWith("0x095ea7b3")) {
        const { args } = decodeFunctionData({ abi: erc20Abi, data: tx.data });
        allowances.set(`${tx.to}:${args![0]}`, args![1] as bigint);
      }
      return hashOf(sent.length - 1);
    },
    signTypedData: async () => `0x${"ab".repeat(65)}`,
  };
  const runner = createRunner({
    vault: () => VAULT,
    chain: {
      waitReceipt: async (hash) => {
        const i = Number(BigInt(hash)) - 1;
        return { status: opts.reverted?.(sent[i]!, i) ? "reverted" : "success" };
      },
      pendingNonce: async () => 5,
      allowance: async (token, _owner, spender) => allowances.get(`${token}:${spender}`) ?? 0n,
      gasPrice: async () => 1_000_000_000n,
    },
  });
  const setLeg = (i: number, patch: Partial<Leg>) => {
    intent = { ...intent, legs: intent.legs.map((l) => (l.leg_index === i ? { ...l, ...patch } : l)) };
  };
  const backend: Backend = {
    load: async () => intent,
    advance: async (input) => {
      log.push(String(input.action));
      const i = input.legIndex as number;
      if (input.action === "fee_paid") intent = { ...intent, fee_receipt_id: 1, status: "fee_paid" };
      if (input.action === "leg_sent") setLeg(i, { status: "signed", tx_hash: input.txHash as string });
      if (input.action === "leg") {
        setLeg(i, { status: "filled", actual_out: "50" });
        if (intent.legs.every((l) => l.status === "filled")) intent = { ...intent, status: intent.kind === "buy_stock" ? "done" : "legs_done" };
      }
      if (input.action === "deposit") intent = { ...intent, status: "done", position_id: 9 };
      return intent;
    },
    quote: async (legIndex) => {
      const n = (quotes.get(legIndex) ?? 0) + 1;
      quotes.set(legIndex, n);
      log.push(`quote-${legIndex}`);
      setLeg(legIndex, { status: "quoted", mode: "SWAP" });
      return opts.quote?.(legIndex, n) ?? { status: "ready", mode: "SWAP", expectedOut: "50", minOut: "49", expiresAt: 0, tx: { to: ROUTER, data: "0xdeadbeef", value: "0", gas: "500000" } };
    },
    submitOrder: async () => undefined,
    orderStatus: async () => "FILLED",
    approvals: opts.approvals,
  };
  const fn = (tx: Sent) => (tx.to === VAULT ? decodeFunctionData({ abi: vaultAbi, data: tx.data }).functionName : tx.data.startsWith("0x095ea7b3") ? `approve:${decodeFunctionData({ abi: erc20Abi, data: tx.data }).args![0]}` : "swap");
  return { run: () => runner.runIntent({ backend, signer }), signer, sent, log, calls: () => sent.map(fn), get: () => intent };
}

describe("runIntent", () => {
  it("buys a stock: router approval, fee approval and fee in one burst, then a single quote and swap", async () => {
    const w = world(buyIntent("buy_stock", [leg(0, NVDA, "990")]), { approvals: async () => [{ token: USDT_ADDRESS, spender: ROUTER, amount: "990" }] });
    const done = await w.run();
    expect(done.status).toBe("done");
    expect(w.calls()).toEqual([`approve:${ROUTER}`, `approve:${VAULT}`, "payBuyFee", "swap"]);
    // Back-to-back nonces, and the fee call carries a fixed gas limit because its approval isn't mined yet.
    expect(w.sent.map((t) => t.nonce)).toEqual([5, 6, 7, 8]);
    expect(w.sent[2]!.gas).toBe(350_000n);
    expect(w.log).toEqual(["fee_paid", "quote-0", "leg_sent", "leg"]);
  });

  it("still works when no approvals are known ahead: the leg approves when its quote asks", async () => {
    const w = world(buyIntent("buy_stock", [leg(0, NVDA, "990")]), {
      quote: (_i, n) =>
        n === 1
          ? { status: "needs_approval", mode: "SWAP", approve: { token: USDT_ADDRESS, spender: ROUTER, amount: "990", data: "0x095ea7b3" + "0".repeat(24) + ROUTER.slice(2) + (990).toString(16).padStart(64, "0") as `0x${string}` } }
          : { status: "ready", mode: "SWAP", expectedOut: "50", minOut: "49", expiresAt: 0, tx: { to: ROUTER, data: "0xdeadbeef", value: "0", gas: null } },
    });
    expect((await w.run()).status).toBe("done");
    expect(w.calls()).toEqual([`approve:${VAULT}`, "payBuyFee", `approve:${ROUTER}`, "swap"]);
    expect(w.log).toEqual(["fee_paid", "quote-0", "quote-0", "leg_sent", "leg"]);
  });

  it("buys a basket: legs in order, then every deposit approval with openPosition, never before all legs fill", async () => {
    const w = world(buyIntent("buy_stack", [leg(0, NVDA, "600"), leg(1, MSFT, "390")]), { approvals: async () => [{ token: USDT_ADDRESS, spender: ROUTER, amount: "990" }] });
    expect((await w.run()).status).toBe("done");
    expect(w.calls()).toEqual([`approve:${ROUTER}`, `approve:${VAULT}`, "payBuyFee", "swap", "swap", `approve:${VAULT}`, `approve:${VAULT}`, "openPosition"]);
    expect(w.log).toEqual(["fee_paid", "quote-0", "leg_sent", "leg", "quote-1", "leg_sent", "leg", "deposit"]);
  });

  it("records a paid fee even if the side approval for the router reverted", async () => {
    const w = world(buyIntent("buy_stock", [leg(0, NVDA, "990")]), { approvals: async () => [{ token: USDT_ADDRESS, spender: ROUTER, amount: "990" }], reverted: (_tx, i) => i === 0 });
    await w.run();
    expect(w.log[0]).toBe("fee_paid");
  });

  it("stops without recording a fee when the fee call itself reverted", async () => {
    const w = world(buyIntent("buy_stock", [leg(0, NVDA, "990")]), { reverted: (tx) => tx.to === VAULT });
    await expect(w.run()).rejects.toThrow("Transaction reverted");
    expect(w.log).toEqual([]);
  });

  it("carries on if the approvals lookup fails", async () => {
    const w = world(buyIntent("buy_stock", [leg(0, NVDA, "990")]), {
      approvals: async () => {
        throw new Error("binance down");
      },
    });
    expect((await w.run()).status).toBe("done");
    expect(w.calls()).toEqual([`approve:${VAULT}`, "payBuyFee", "swap"]);
  });

  it("turns a rejected quote into a stop the user can retry", async () => {
    const w = world(buyIntent("buy_stock", [leg(0, NVDA, "990")]), {
      quote: () => {
        throw Object.assign(new Error("The market for this stock is closed right now."), { status: 422 });
      },
    });
    const err = await w.run().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StopError);
    expect((err as StopError).step).toBe("leg-0");
  });

  it("uses the wallet's batch path when it has one: one call per burst, nonces assigned up front", async () => {
    const batches: number[][] = [];
    const w = world(buyIntent("buy_stock", [leg(0, NVDA, "990")]), { approvals: async () => [{ token: USDT_ADDRESS, spender: ROUTER, amount: "990" }] });
    const one = w.signer.sendTransaction;
    w.signer.sendBatch = async (txs) => {
      batches.push(txs.map((t) => t.nonce));
      const hashes: Hash[] = [];
      for (const tx of txs) hashes.push(await one(tx));
      return hashes;
    };
    expect((await w.run()).status).toBe("done");
    expect(batches).toEqual([[5, 6, 7], [8]]);
    expect(w.calls()).toEqual([`approve:${ROUTER}`, `approve:${VAULT}`, "payBuyFee", "swap"]);
    expect(w.sent[2]!.gas).toBe(350_000n);
  });

  it("does nothing to a finished intent", async () => {
    const w = world({ ...buyIntent("buy_stock", [leg(0, NVDA, "990")]), status: "done" });
    await w.run();
    expect(w.sent).toEqual([]);
  });
});

import "server-only";
import { createPublicClient, erc20Abi, getAddress, http, type Address, type Hash } from "viem";
import { bsc } from "viem/chains";
import { serverEnv } from "@/lib/env";

let client: ReturnType<typeof makeClient> | undefined;
function makeClient() {
  return createPublicClient({ chain: bsc, transport: http(serverEnv().BSC_RPC_URL, { retryCount: 4, retryDelay: 300 }), batch: { multicall: true } });
}
export function publicClient() {
  return (client ??= makeClient());
}

export async function readErc20Balances(owner: Address, tokens: Address[]): Promise<Map<Address, bigint>> {
  const pc = publicClient();
  const res = await pc.multicall({
    contracts: tokens.map((t) => ({ address: t, abi: erc20Abi, functionName: "balanceOf", args: [owner] }) as const),
    allowFailure: true,
  });
  const out = new Map<Address, bigint>();
  tokens.forEach((t, i) => {
    const r = res[i];
    out.set(getAddress(t), r && r.status === "success" ? (r.result as bigint) : 0n);
  });
  return out;
}

export type TokenMeta = { address: Address; hasCode: boolean; decimals?: number; symbol?: string; name?: string };

/** Code check plus decimals/symbol/name, used before anything is allowlisted. */
export async function readTokenMeta(tokens: Address[]): Promise<TokenMeta[]> {
  const pc = publicClient();
  // Small batches: free-tier RPC limits reject a burst of eth_getCode calls.
  const codes: (string | undefined)[] = [];
  for (let i = 0; i < tokens.length; i += 8) {
    codes.push(...(await Promise.all(tokens.slice(i, i + 8).map((t) => pc.getCode({ address: t })))));
    if (i + 8 < tokens.length) await new Promise((r) => setTimeout(r, 150));
  }
  const reads = await pc.multicall({
    contracts: tokens.flatMap(
      (t) =>
        [
          { address: t, abi: erc20Abi, functionName: "decimals" },
          { address: t, abi: erc20Abi, functionName: "symbol" },
          { address: t, abi: erc20Abi, functionName: "name" },
        ] as const,
    ),
    allowFailure: true,
  });
  return tokens.map((t, i) => {
    const [d, s, n] = [reads[i * 3], reads[i * 3 + 1], reads[i * 3 + 2]];
    return {
      address: getAddress(t),
      hasCode: !!codes[i] && codes[i] !== "0x",
      decimals: d?.status === "success" ? Number(d.result) : undefined,
      symbol: s?.status === "success" ? String(s.result) : undefined,
      name: n?.status === "success" ? String(n.result) : undefined,
    };
  });
}

export async function waitForReceipt(hash: Hash, timeoutMs = 90_000) {
  return publicClient().waitForTransactionReceipt({ hash, timeout: timeoutMs });
}

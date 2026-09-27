import { keccak256, toBytes } from "viem";
import { z } from "zod";
import { vaultAbi } from "@/lib/contracts/vault";
import { publicClient } from "@/server/chain";
import { db, must } from "@/server/db";
import { handler, json } from "@/server/http";
import { vaultAddress } from "@/server/vault";

const query = z.object({ t: z.string().regex(/^[A-Z]{2,6}$/) });

/** Ticker availability, checked against the contract (authoritative) and our cache. */
export const GET = handler(async (req: Request) => {
  const { t } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const vault = vaultAddress();
  let taken = false;
  if (vault) {
    taken = await publicClient().readContract({ address: vault, abi: vaultAbi, functionName: "tickerTaken", args: [keccak256(toBytes(t))] });
  } else {
    taken = (must(await db().from("stacks").select("id").eq("ticker", t)) as unknown[]).length > 0;
  }
  return json({ ticker: t, available: !taken });
});

import { z } from "zod";
import { authenticate } from "@/server/auth";
import { handler, json, rateLimit, readJson } from "@/server/http";
import { syncTx } from "@/server/vault";

const body = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

/** Targeted event sync right after a user action (createStack, claim), so the UI needn't wait for cron. */
export const POST = handler(async (req: Request) => {
  const ctx = await authenticate(req);
  await rateLimit(`sync:${ctx.privyId}`, 30, 60);
  const { txHash } = await readJson(req, body);
  const r = await syncTx(txHash as `0x${string}`);
  return json({ status: r.status, logs: r.logs, blockNumber: r.blockNumber.toString() });
});

import { z } from "zod";
import { requireProfile } from "@/server/auth";
import { handler, json, rateLimit, readJson } from "@/server/http";
import { loadIntent, submitOrder } from "@/server/intents";

const body = z.object({
  intentId: z.string().uuid(),
  legIndex: z.number().int().min(0).max(4),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "65-byte hex signature"),
  // quoteRef is accepted for API parity; the server uses the RFQ quote it stored on the leg.
  quoteRef: z.string().optional(),
});

/** Submit a signed RFQ order. Idempotency key is derived from intentId:legIndex:attempt. */
export const POST = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  await rateLimit(`orders:${ctx.profile.id}`, 30, 60);
  const b = await readJson(req, body);
  const intent = await loadIntent(b.intentId, ctx);
  return json(await submitOrder(ctx, intent, b.legIndex, b.signature as `0x${string}`));
});

import { z } from "zod";
import { requireProfile } from "@/server/auth";
import { handler, json, rateLimit, readJson } from "@/server/http";
import { advanceIntent, loadIntent } from "@/server/intents";

const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((s) => s as `0x${string}`);
const legIndex = z.number().int().min(0).max(4);

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("fee_paid"), txHash: hash }),
  z.object({ action: z.literal("leg_sent"), legIndex, txHash: hash }),
  z.object({ action: z.literal("leg"), legIndex, txHash: hash }),
  z.object({ action: z.literal("resubmit"), legIndex }),
  z.object({ action: z.literal("release"), txHash: hash }),
  z.object({ action: z.literal("deposit"), txHash: hash }),
  z.object({ action: z.literal("sell_fee"), txHash: hash }),
  z.object({ action: z.literal("retry"), legIndex }),
  z.object({ action: z.literal("cancel") }),
]);

export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireProfile(req);
  return json(await loadIntent((await params).id, ctx));
});

/** Advance one step. The server verifies the tx or order against chain/Binance before saving. */
export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireProfile(req);
  await rateLimit(`intent-patch:${ctx.profile.id}`, 60, 60);
  return json(await advanceIntent(ctx, (await params).id, await readJson(req, body)));
});

import { z } from "zod";
import { requireProfile } from "@/server/auth";
import { handler, json, rateLimit, readJson } from "@/server/http";
import { activeIntents, createIntent } from "@/server/intents";

const raw = z.string().regex(/^\d+$/, "raw integer string");
const bps = z.number().int().min(1).max(10_000);

const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("buy_stock"), assetAddress: z.string(), grossAmount: raw }),
  z.object({ kind: z.literal("buy_stack"), stackId: z.number().int().min(1), grossAmount: raw }),
  z.object({ kind: z.literal("sell_stock"), assetAddress: z.string(), bps }),
  z.object({ kind: z.literal("sell_stack"), positionId: z.number().int().min(1), bps }),
  z.object({ kind: z.literal("redeem"), positionId: z.number().int().min(1), bps }),
]);

/** Server computes fee and per-leg allocation from the chain recipe. */
export const POST = handler(async (req: Request) => {
  const ctx = await requireProfile(req, { cachedProfile: true });
  await rateLimit(`intents:${ctx.profile.id}`, 20, 60);
  return json(await createIntent(ctx, await readJson(req, body)));
});

/** Unfinished intents, for the "You have an unfinished buy" banner. */
export const GET = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  return json({ items: await activeIntents(ctx) });
});

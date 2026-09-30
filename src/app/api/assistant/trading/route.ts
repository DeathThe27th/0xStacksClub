import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { saveTradeSettings, tradeSettings, tradingConfigured } from "@/server/assistant";
import { requireProfile } from "@/server/auth";
import { handler, json, rateLimit, readJson } from "@/server/http";

const noStore = { headers: { "cache-control": "private, no-store" } };

/** Text buys: whether they're on and the user's limits. `signerId` is what the wallet grants permission to. */
export const GET = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  return json({ available: tradingConfigured(), signerId: publicEnv().NEXT_PUBLIC_PRIVY_SIGNER_ID ?? null, ...(await tradeSettings(ctx.profile.id)) }, noStore);
});

const body = z.object({ enabled: z.boolean(), capUsd: z.number().min(1).max(10_000), dailyUsd: z.number().min(1).max(50_000) });

/** Turning it on only works once the wallet has actually granted the permission (checked with Privy). */
export const PUT = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  await rateLimit(`trading:${ctx.profile.id}`, 20, 600);
  const saved = await saveTradeSettings(ctx, await readJson(req, body));
  return json({ available: tradingConfigured(), signerId: publicEnv().NEXT_PUBLIC_PRIVY_SIGNER_ID ?? null, ...saved }, noStore);
});

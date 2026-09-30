import { startTelegramLink, telegramStatus, unlinkTelegramProfile } from "@/server/assistant";
import { requireProfile } from "@/server/auth";
import { handler, json } from "@/server/http";

const noStore = { headers: { "cache-control": "private, no-store" } };

/** The signed-in user's Telegram connection. */
export const GET = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  return json(await telegramStatus(ctx.profile.id), noStore);
});

/** Connect Telegram: returns a t.me link that carries a one-time code, valid for 10 minutes. */
export const POST = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  return json(await startTelegramLink(ctx), noStore);
});

/** Disconnect Telegram. */
export const DELETE = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  await unlinkTelegramProfile(ctx.profile.id);
  return json(await telegramStatus(ctx.profile.id), noStore);
});

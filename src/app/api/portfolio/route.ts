import { authenticate } from "@/server/auth";
import { handler, json } from "@/server/http";
import { portfolioFor } from "@/server/portfolio";

/** USDT and BNB balances, single stock holdings, positions with values, total and 24h change. */
export const GET = handler(async (req: Request) => {
  const ctx = await authenticate(req);
  return json(await portfolioFor(ctx.wallet, ctx.profile?.id ?? null));
});

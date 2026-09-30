import { z } from "zod";
import { linkedBotRoute, phoneBody } from "@/server/bot";
import { textSell } from "@/server/botTrade";

// With `execute`, the whole sell runs inside this request.
export const maxDuration = 300;

const body = phoneBody.extend({
  query: z.string().trim().min(1).max(80),
  percent: z.number().positive().max(100).optional(),
  usd: z.number().positive().optional(),
  execute: z.boolean().default(false),
});

/** Sell a stock by text: a preview first, then the sale itself once the user has replied yes. */
export const POST = linkedBotRoute(body, async ({ query, percent, usd, execute }, user) => textSell(user, { query, percent, usd, execute }));

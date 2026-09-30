import { z } from "zod";
import { linkedBotRoute, phoneBody } from "@/server/bot";
import { prepareBuy } from "@/server/botTrade";

const body = phoneBody.extend({ query: z.string().trim().min(1).max(80), amount: z.number() });

/** A buy asked for by text: checks the user's limits and balance and parks it. Nothing is spent until /confirm. */
export const POST = linkedBotRoute(body, async ({ query, amount }, user) => prepareBuy(user, query, amount, user.channel));

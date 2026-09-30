import { z } from "zod";
import { botBuyLinkAny, linkedBotRoute, phoneBody } from "@/server/bot";

const body = phoneBody.extend({ query: z.string().trim().min(1).max(80), amount: z.number() });

/** Link to the buy form of a stock (first) or a basket. Never creates an intent or a transaction. */
export const POST = linkedBotRoute(body, async ({ query, amount }) => botBuyLinkAny(query, amount));

import { z } from "zod";
import { botBuyLink, linkedBotRoute, phoneBody } from "@/server/bot";

const body = phoneBody.extend({ query: z.string().trim().min(1).max(80), amount: z.number() });

/** Builds a link to the basket's buy sheet. Never creates an intent, a quote or a transaction. */
export const POST = linkedBotRoute(body, async ({ query, amount }) => botBuyLink(query, amount));

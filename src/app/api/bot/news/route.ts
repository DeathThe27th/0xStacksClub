import { z } from "zod";
import { botNews, linkedBotRoute, phoneBody } from "@/server/bot";

const body = phoneBody.extend({ query: z.string().trim().max(80).optional() });

/** News for one stock (with its price), or a briefing across the user's holdings and the market. */
export const POST = linkedBotRoute(body, async ({ query }, user) => botNews(user, query));

import { z } from "zod";
import { botLookup, linkedBotRoute, phoneBody } from "@/server/bot";

const body = phoneBody.extend({ query: z.string().trim().min(1).max(80) });

/** A stock or a basket by name. Stocks come first. */
export const POST = linkedBotRoute(body, async ({ query }) => botLookup(query));

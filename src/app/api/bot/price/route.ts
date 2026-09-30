import { z } from "zod";
import { botPrice, linkedBotRoute, phoneBody } from "@/server/bot";

const body = phoneBody.extend({ query: z.string().trim().min(1).max(80) });

export const POST = linkedBotRoute(body, async ({ query }) => botPrice(query));

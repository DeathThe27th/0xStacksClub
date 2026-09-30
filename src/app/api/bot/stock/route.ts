import { z } from "zod";
import { botStock, linkedBotRoute, phoneBody } from "@/server/bot";

const body = phoneBody.extend({ query: z.string().trim().min(1).max(40) });

export const POST = linkedBotRoute(body, async ({ query }) => botStock(query));

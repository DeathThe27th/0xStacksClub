import { z } from "zod";
import { botStocks, linkedBotRoute, phoneBody } from "@/server/bot";

const body = phoneBody.extend({ sort: z.enum(["volume", "gainers", "losers"]).default("volume") });

export const POST = linkedBotRoute(body, async ({ sort }) => botStocks(sort));

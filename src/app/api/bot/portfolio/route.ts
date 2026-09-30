import { z } from "zod";
import { botPortfolio, linkedBotRoute, phoneBody } from "@/server/bot";

const body = phoneBody.extend({ week: z.boolean().optional() });

export const POST = linkedBotRoute(body, async ({ week }, user) => botPortfolio(user, { week }));

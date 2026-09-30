import { z } from "zod";
import { linkedBotRoute, phoneBody } from "@/server/bot";
import { confirmBuy } from "@/server/botTrade";

// The whole buy runs inside this request: fee, swap and, for a basket, the deposit.
export const maxDuration = 300;

const body = phoneBody.extend({ orderId: z.string().uuid().optional() });

/** The user replied yes: run their pending order. */
export const POST = linkedBotRoute(body, async ({ orderId }, user) => confirmBuy(user, orderId));

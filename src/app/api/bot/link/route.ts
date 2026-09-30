import { z } from "zod";
import { confirmSender } from "@/server/assistant";
import { botRoute, phoneBody } from "@/server/bot";

const body = phoneBody.extend({ code: z.string().min(6).max(64) });

/**
 * "link <code>" on iMessage (the code only works from the phone it was issued for) or
 * "/start <code>" on Telegram (the code from the Connect Telegram link).
 */
export const POST = botRoute(body, async ({ code }, sender) => ({ ok: true, ...(await confirmSender(sender, code)) }));

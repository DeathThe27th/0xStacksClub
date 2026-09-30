import { unlinkSender } from "@/server/assistant";
import { botRoute, phoneBody } from "@/server/bot";

/** "stop". On iMessage the bot sends its goodbye, then calls /api/bot/release. */
export const POST = botRoute(phoneBody, async (_body, sender) => unlinkSender(sender));

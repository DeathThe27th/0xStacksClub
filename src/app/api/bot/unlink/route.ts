import { botRoute, phoneBody } from "@/server/bot";
import { unlinkPhone } from "@/server/imessage";

/** "stop" from this phone. The bot sends its goodbye, then calls /api/bot/release. */
export const POST = botRoute(phoneBody, async ({ phone }) => unlinkPhone(phone));

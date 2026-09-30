import { botConfig } from "@/server/bot";
import { handler, json } from "@/server/http";
import { requireBot } from "@/server/imessage";

/** What the bot needs to talk like the site: the app name comes from APP_NAME, never the bot's code. */
export const GET = handler(async (req: Request) => {
  requireBot(req);
  return json(botConfig(), { headers: { "cache-control": "private, no-store" } });
});

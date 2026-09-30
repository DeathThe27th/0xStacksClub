import { resolveSender } from "@/server/assistant";
import { botRoute, phoneBody } from "@/server/bot";

/** Is this sender connected to an account? */
export const POST = botRoute(phoneBody, async (_body, sender) => {
  const user = await resolveSender(sender);
  return user ? { linked: true, username: user.profile.username, number: user.number, channel: user.channel } : { linked: false };
});

import { botRoute, phoneBody } from "@/server/bot";
import { linkedUser } from "@/server/imessage";

/** Is this phone connected to an account? */
export const POST = botRoute(phoneBody, async ({ phone }) => {
  const user = await linkedUser(phone);
  return user ? { linked: true, username: user.profile.username, number: user.number } : { linked: false };
});

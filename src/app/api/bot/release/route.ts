import { z } from "zod";
import { botRoute, phoneBody } from "@/server/bot";
import { releasePhotonUser } from "@/server/imessage";

const body = phoneBody.extend({ photonUserId: z.string().uuid() });

/** After the goodbye: free the phone's Photon user slot, unless it has been linked again since. */
export const POST = botRoute(body, async ({ photonUserId }) => {
  await releasePhotonUser(photonUserId);
  return { ok: true };
});

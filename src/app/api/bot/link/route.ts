import { z } from "zod";
import { botRoute, phoneBody } from "@/server/bot";
import { confirmLink } from "@/server/imessage";

const body = phoneBody.extend({ code: z.string().regex(/^\d{6}$/) });

/** "link <code>" arrived from this phone. Links it if the code was issued for the same phone. */
export const POST = botRoute(body, async ({ phone, code }) => ({ ok: true, ...(await confirmLink(phone, code)) }));

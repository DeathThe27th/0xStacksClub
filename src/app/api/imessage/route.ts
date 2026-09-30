import { z } from "zod";
import { requireProfile } from "@/server/auth";
import { handler, json, readJson } from "@/server/http";
import { imessageStatus, startLink, unlinkProfile } from "@/server/imessage";

const noStore = { headers: { "cache-control": "private, no-store" } };

/** The signed-in user's iMessage connection: linked phone (masked) and any pending code. */
export const GET = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  return json(await imessageStatus(ctx.profile.id), noStore);
});

const body = z.object({ phone: z.string().min(8).max(24) });

/** Connect iMessage: registers the phone and returns a 10-minute code to text from it. */
export const POST = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  const { phone } = await readJson(req, body);
  return json(await startLink(ctx, phone), noStore);
});

/** Disconnect iMessage. */
export const DELETE = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  await unlinkProfile(ctx.profile.id);
  return json(await imessageStatus(ctx.profile.id), noStore);
});

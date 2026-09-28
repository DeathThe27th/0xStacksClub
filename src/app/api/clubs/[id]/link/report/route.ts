import { authenticate } from "@/server/auth";
import { clubAccess, getClubLink, getStackRow, reportClubLink } from "@/server/clubs";
import { handler, HttpError, json, rateLimit } from "@/server/http";

/** Report the basket's current Telegram link. Only holders can see it, so only holders can report it. */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "Bad basket id");
  const ctx = await authenticate(req);
  await rateLimit(`clubreport:${ctx.wallet.toLowerCase()}`, 10, 3600);
  const stack = await getStackRow(id);
  const [url, role] = await Promise.all([getClubLink(id), clubAccess(stack, ctx)]);
  if (!url) throw new HttpError(404, "This basket has no club link");
  if (!role.isMember) throw new HttpError(403, "Only holders can report this link");
  await reportClubLink(id, url, ctx.wallet, ctx.profile?.id ?? null);
  return json({ ok: true });
});

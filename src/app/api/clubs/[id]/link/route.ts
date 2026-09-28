import { z } from "zod";
import { normalizeTelegramUrl, TELEGRAM_URL_ERROR } from "@/lib/telegram";
import { maybeAuthenticate, requireProfile } from "@/server/auth";
import { clubAccess, getClubLink, getStackRow, setClubLink } from "@/server/clubs";
import { handler, HttpError, json, rateLimit, readJson } from "@/server/http";

async function stackFrom(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "Bad basket id");
  return getStackRow(id);
}

/**
 * The basket's Telegram club link. `url` is only returned to the creator and to wallets holding an
 * open position in the basket (checked onchain); everyone else just learns whether one exists.
 */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const stack = await stackFrom(params);
  const [ctx, url] = await Promise.all([maybeAuthenticate(req), getClubLink(Number(stack.id))]);
  const role = await clubAccess(stack, ctx);
  return json({ hasLink: url !== null, url: role.isMember ? url : null, ...role }, { headers: { "cache-control": "private, no-store" } });
});

const body = z.object({ url: z.string().max(200).nullable() });

/** Creator only: set, change or clear (url: null) the link. */
export const PUT = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const stack = await stackFrom(params);
  const ctx = await requireProfile(req);
  const role = await clubAccess(stack, ctx);
  if (!role.isOwner) throw new HttpError(403, "Only the basket's creator can change its club link");
  await rateLimit(`clublink:${ctx.profile.id}`, 10, 3600);
  const { url } = await readJson(req, body);
  const clean = url === null || url.trim() === "" ? null : normalizeTelegramUrl(url);
  if (url !== null && url.trim() !== "" && !clean) throw new HttpError(400, TELEGRAM_URL_ERROR);
  await setClubLink(Number(stack.id), clean, ctx.profile.id);
  return json({ url: clean });
});

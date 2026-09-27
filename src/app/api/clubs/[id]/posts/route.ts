import { z } from "zod";
import { maybeAuthenticate, requireProfile } from "@/server/auth";
import { clubRole, decoratePosts, getStackRow, listPosts, requireMember, type ClubPost } from "@/server/clubs";
import { db, must } from "@/server/db";
import { handler, HttpError, json, rateLimit, readJson } from "@/server/http";

const query = z.object({ before: z.string().datetime({ offset: true }).optional() });

export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const stack = await getStackRow(Number((await params).id));
  const { before } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const ctx = await maybeAuthenticate(req);
  const role = await clubRole(stack, ctx?.wallet ?? null);
  return json({ items: await listPosts(stack, role.isMember, before), viewer: role });
});

const body = z.object({ body: z.string().trim().min(1).max(500), kind: z.enum(["message", "announcement"]).default("message") });

/** Members post; only the creator can post announcements. */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireProfile(req);
  const stack = await getStackRow(Number((await params).id));
  await rateLimit(`club:${ctx.profile.id}`, 20, 60);
  const b = await readJson(req, body);
  const role = await requireMember(ctx, stack);
  if (b.kind === "announcement" && !role.isOwner) throw new HttpError(403, "Only the creator can post announcements");
  const row = must(
    await db().from("club_posts").insert({ stack_id: stack.id, profile_id: ctx.profile.id, kind: b.kind, body: b.body }).select("*").single(),
  ) as ClubPost;
  return json({ post: (await decoratePosts([row], stack))[0] });
});

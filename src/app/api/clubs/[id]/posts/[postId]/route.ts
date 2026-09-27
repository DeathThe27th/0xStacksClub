import { z } from "zod";
import { requireProfile } from "@/server/auth";
import { clubRole, getStackRow, type ClubPost } from "@/server/clubs";
import { db, must } from "@/server/db";
import { handler, HttpError, json, readJson } from "@/server/http";

async function load(stackId: number, postId: string) {
  const post = must(await db().from("club_posts").select("*").eq("id", postId).eq("stack_id", stackId).maybeSingle()) as ClubPost | null;
  if (!post) throw new HttpError(404, "Post not found");
  return post;
}

const body = z.object({ pinned: z.boolean() });

/** Pin or unpin: creator only. */
export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string; postId: string }> }) => {
  const ctx = await requireProfile(req);
  const { id, postId } = await params;
  const stack = await getStackRow(Number(id));
  const role = await clubRole(stack, ctx.wallet);
  if (!role.isOwner) throw new HttpError(403, "Only the creator can pin");
  const { pinned } = await readJson(req, body);
  await load(stack.id, postId);
  must(await db().from("club_posts").update({ pinned }).eq("id", postId));
  return json({ pinned });
});

/** Remove: the creator (moderation) or the author. Kept as a tombstone. */
export const DELETE = handler(async (req: Request, { params }: { params: Promise<{ id: string; postId: string }> }) => {
  const ctx = await requireProfile(req);
  const { id, postId } = await params;
  const stack = await getStackRow(Number(id));
  const post = await load(stack.id, postId);
  const role = await clubRole(stack, ctx.wallet);
  if (!role.isOwner && post.profile_id !== ctx.profile.id) throw new HttpError(403, "You can only remove your own posts");
  must(await db().from("club_posts").update({ removed: true, removed_by: ctx.profile.id, pinned: false }).eq("id", postId));
  return json({ removed: true });
});

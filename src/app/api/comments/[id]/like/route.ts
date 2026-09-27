import { requireProfile } from "@/server/auth";
import { db, must } from "@/server/db";
import { handler, json, rateLimit } from "@/server/http";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireProfile(req);
  await rateLimit(`like:${ctx.profile.id}`, 60, 60);
  must(await db().from("comment_likes").upsert({ comment_id: (await params).id, profile_id: ctx.profile.id }, { ignoreDuplicates: true }));
  return json({ liked: true });
});

export const DELETE = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireProfile(req);
  must(await db().from("comment_likes").delete().eq("comment_id", (await params).id).eq("profile_id", ctx.profile.id));
  return json({ liked: false });
});

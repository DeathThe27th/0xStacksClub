import { z } from "zod";
import { requireProfile } from "@/server/auth";
import { db, must } from "@/server/db";
import { handler, HttpError, json, rateLimit, readJson } from "@/server/http";

const body = z.object({ profileId: z.string().uuid() });

export const POST = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  await rateLimit(`follow:${ctx.profile.id}`, 60, 60);
  const { profileId } = await readJson(req, body);
  if (profileId === ctx.profile.id) throw new HttpError(400, "You can't follow yourself");
  must(await db().from("follows").upsert({ follower_id: ctx.profile.id, followee_id: profileId }, { ignoreDuplicates: true }));
  return json({ following: true });
});

export const DELETE = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  const { profileId } = await readJson(req, body);
  must(await db().from("follows").delete().eq("follower_id", ctx.profile.id).eq("followee_id", profileId));
  return json({ following: false });
});

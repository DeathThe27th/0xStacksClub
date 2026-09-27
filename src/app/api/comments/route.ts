import { getAddress, isAddress } from "viem";
import { z } from "zod";
import type { CommentRow } from "@/lib/supabase/types";
import { maybeAuthenticate, requireProfile } from "@/server/auth";
import { db, must } from "@/server/db";
import { handler, HttpError, json, rateLimit, readJson } from "@/server/http";
import { decorateComments, listComments } from "@/server/social";

const target = z.object({ targetType: z.enum(["asset", "stack"]), targetId: z.string().min(1).max(64) });

function normalize(t: z.infer<typeof target>) {
  if (t.targetType === "asset") {
    if (!isAddress(t.targetId)) throw new HttpError(400, "Bad asset address");
    return { type: t.targetType, id: getAddress(t.targetId) };
  }
  if (!/^\d+$/.test(t.targetId)) throw new HttpError(400, "Bad Stack id");
  return { type: t.targetType, id: t.targetId };
}

export const GET = handler(async (req: Request) => {
  const t = normalize(target.parse(Object.fromEntries(new URL(req.url).searchParams)));
  const ctx = await maybeAuthenticate(req);
  return json({ items: await listComments(t, ctx?.profile?.id ?? null) });
});

const body = target.extend({ body: z.string().trim().min(1).max(280), parentId: z.string().uuid().optional() });

export const POST = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  await rateLimit(`comment:${ctx.profile.id}`, 10, 60);
  const b = await readJson(req, body);
  const t = normalize(b);
  if (b.parentId) {
    const parent = must(await db().from("comments").select("target_type, target_id").eq("id", b.parentId).maybeSingle()) as {
      target_type: string;
      target_id: string;
    } | null;
    if (!parent || parent.target_type !== t.type || parent.target_id !== t.id) throw new HttpError(400, "Reply target mismatch");
  }
  const row = must(
    await db()
      .from("comments")
      .insert({ profile_id: ctx.profile.id, target_type: t.type, target_id: t.id, parent_id: b.parentId ?? null, body: b.body })
      .select("*")
      .single(),
  ) as CommentRow;
  return json({ comment: (await decorateComments([row], ctx.profile.id))[0] });
});

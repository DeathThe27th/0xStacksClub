import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { requireProfile } from "@/server/auth";
import { db, must } from "@/server/db";
import { handler, HttpError, json, readJson } from "@/server/http";

const body = z.object({ targetType: z.enum(["asset", "stack"]), targetId: z.string() });

function id(b: z.infer<typeof body>) {
  if (b.targetType === "asset") {
    if (!isAddress(b.targetId)) throw new HttpError(400, "Bad address");
    return getAddress(b.targetId);
  }
  return String(Number(b.targetId));
}

export const GET = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  return json({ items: must(await db().from("watchlist").select("target_type, target_id").eq("profile_id", ctx.profile.id)) });
});

export const POST = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  const b = await readJson(req, body);
  must(await db().from("watchlist").upsert({ profile_id: ctx.profile.id, target_type: b.targetType, target_id: id(b) }, { ignoreDuplicates: true }));
  return json({ watching: true });
});

export const DELETE = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  const b = await readJson(req, body);
  must(await db().from("watchlist").delete().eq("profile_id", ctx.profile.id).eq("target_type", b.targetType).eq("target_id", id(b)));
  return json({ watching: false });
});

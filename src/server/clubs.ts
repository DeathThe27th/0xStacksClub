import "server-only";
import { getAddress, type Address } from "viem";
import type { StackRow } from "@/lib/supabase/types";
import type { AuthContext } from "@/server/auth";
import { db, must } from "@/server/db";
import { HttpError } from "@/server/http";
import { profilesByIds, type ProfileLite } from "@/server/social";
import { readPositionsOf } from "@/server/vault";

export type ClubPost = {
  id: string;
  stack_id: number;
  profile_id: string | null;
  kind: "message" | "announcement";
  body: string;
  pinned: boolean;
  removed: boolean;
  created_at: string;
};
export type ClubPostOut = ClubPost & { author: ProfileLite | null; isCreator: boolean };

export async function getStackRow(stackId: number): Promise<StackRow> {
  const s = must(await db().from("stacks").select("*").eq("id", stackId).maybeSingle()) as StackRow | null;
  if (!s) throw new HttpError(404, "Club not found");
  return s;
}

/** Owner = the Stack's creator. Member = holds an open position in the Stack, onchain. */
export async function clubRole(stack: StackRow, wallet: Address | null): Promise<{ isOwner: boolean; isMember: boolean }> {
  if (!wallet) return { isOwner: false, isMember: false };
  const isOwner = getAddress(stack.creator_address) === getAddress(wallet);
  if (isOwner) return { isOwner, isMember: true };
  const positions = await readPositionsOf(wallet).catch(() => []);
  return { isOwner, isMember: positions.some((p) => p.stackId === Number(stack.id)) };
}

export async function requireMember(ctx: AuthContext, stack: StackRow) {
  const role = await clubRole(stack, ctx.wallet);
  if (!role.isMember) throw new HttpError(403, `Only $${stack.ticker} holders can post in this Club. Buy the Stack to join.`, "not_member");
  return role;
}

export async function decoratePosts(rows: ClubPost[], stack: StackRow): Promise<ClubPostOut[]> {
  const authors = await profilesByIds(rows.map((r) => r.profile_id ?? ""));
  return rows.map((r) => ({
    ...r,
    body: r.removed ? "" : r.body,
    author: r.profile_id ? (authors.get(r.profile_id) ?? null) : null,
    isCreator: !!r.profile_id && r.profile_id === stack.creator_id,
  }));
}

/** Members see everything; everyone else sees announcements and pinned posts only. */
export async function listPosts(stack: StackRow, isMember: boolean, before?: string, limit = 50): Promise<ClubPostOut[]> {
  let q = db().from("club_posts").select("*").eq("stack_id", stack.id).eq("removed", false).order("created_at", { ascending: false }).limit(limit);
  if (!isMember) q = q.or("kind.eq.announcement,pinned.eq.true");
  if (before) q = q.lt("created_at", before);
  return decoratePosts(must(await q) as ClubPost[], stack);
}

export async function pinnedPosts(stack: StackRow): Promise<ClubPostOut[]> {
  const rows = must(
    await db().from("club_posts").select("*").eq("stack_id", stack.id).eq("pinned", true).eq("removed", false).order("created_at", { ascending: false }).limit(5),
  ) as ClubPost[];
  return decoratePosts(rows, stack);
}

/** Distinct members per Stack: holders (from confirmed trades) plus the creator, counted once. */
export async function memberCounts(stacks: Pick<StackRow, "id" | "creator_id">[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!stacks.length) return out;
  const rows = must(
    await db().from("holders").select("profile_id, target_id, net_usd").eq("target_type", "stack").in("target_id", stacks.map((s) => String(s.id))),
  ) as { profile_id: string; target_id: string; net_usd: string }[];
  for (const s of stacks) {
    const ids = new Set(rows.filter((r) => Number(r.target_id) === Number(s.id) && Number(r.net_usd) > 0.0001).map((r) => r.profile_id));
    if (s.creator_id) ids.add(s.creator_id);
    out.set(Number(s.id), Math.max(1, ids.size));
  }
  return out;
}

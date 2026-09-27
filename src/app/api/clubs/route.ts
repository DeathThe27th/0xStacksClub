import type { StackRow } from "@/lib/supabase/types";
import { db, must } from "@/server/db";
import { handler, json } from "@/server/http";
import { memberCounts } from "@/server/clubs";
import { summarize } from "@/server/stacks";

/** Clubs tab: one Club per Stack, with member counts and latest activity. */
export const GET = handler(async () => {
  const stacks = must(await db().from("stacks").select("*").order("created_at", { ascending: false }).limit(200)) as StackRow[];
  if (!stacks.length) return json({ items: [] });
  const ids = stacks.map((s) => s.id);
  const [summaries, counts, posts] = await Promise.all([
    summarize(stacks),
    memberCounts(stacks),
    db().from("club_posts").select("stack_id, kind, body, created_at").in("stack_id", ids).eq("removed", false).order("created_at", { ascending: false }).limit(1000).then(must) as Promise<
      { stack_id: number; kind: string; body: string; created_at: string }[]
    >,
  ]);
  const items = summaries.map((s) => {
    const mine = posts.filter((p) => Number(p.stack_id) === Number(s.id));
    const announcement = mine.find((p) => p.kind === "announcement");
    return {
      stack: s,
      members: counts.get(Number(s.id)) ?? 1,
      posts24h: mine.filter((p) => Date.now() - new Date(p.created_at).getTime() < 86400_000).length,
      lastActivityAt: mine[0]?.created_at ?? s.created_at,
      latestAnnouncement: announcement ? { body: announcement.body.slice(0, 140), created_at: announcement.created_at } : null,
    };
  });
  items.sort((a, b) => b.posts24h - a.posts24h || new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
  return json({ items }, { cacheSeconds: 10 });
});

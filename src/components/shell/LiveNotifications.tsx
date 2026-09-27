"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/Toast";
import { usd } from "@/lib/format";
import { useApi } from "@/lib/client/api";
import { useMe } from "@/lib/client/queries";
import type { Activity } from "@/lib/client/types";
import { browserSupabase } from "@/lib/supabase/browser";

/** Realtime toasts for trades over $500 by people the user follows (UI_SPEC §3.7). */
export function LiveNotifications() {
  const me = useMe();
  const toast = useToast();
  const api = useApi();
  const following = useRef<Set<string>>(new Set());
  const profileId = me.data?.profile?.id;

  useEffect(() => {
    if (!profileId) return;
    const sb = browserSupabase();
    sb.from("follows")
      .select("followee_id")
      .eq("follower_id", profileId)
      .then(({ data }) => {
        following.current = new Set((data ?? []).map((r) => r.followee_id as string));
      });
    const channel = sb
      .channel("activity-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity" }, async (payload) => {
        const row = payload.new as { profile_id: string; usd_amount: number | null; type: string };
        if (!following.current.has(row.profile_id)) return;
        if ((row.usd_amount ?? 0) < 500 || (row.type !== "buy" && row.type !== "sell")) return;
        // Decorate through the API so names and targets match the feed.
        const feed = await api<{ items: Activity[] }>("/api/activity?tab=following").catch(() => null);
        const a = feed?.items[0];
        if (!a?.actor) return;
        const name = a.target?.kind === "stack" ? a.target.stack.name : a.target?.kind === "asset" ? a.target.asset.ticker : "a stock";
        toast({ title: `${a.type === "buy" ? "Bought" : "Sold"} ${name}`, body: `@${a.actor.username} ${a.type === "buy" ? "bought" : "sold"} ${usd(Number(a.usd_amount))} of ${name}` });
      })
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [profileId, toast, api]);

  return null;
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Compass, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ActivityItem } from "@/components/social/ActivityItem";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { usd } from "@/lib/format";
import { useApi } from "@/lib/client/api";
import type { Activity, ProfileLite } from "@/lib/client/types";

type Creator = { profile: ProfileLite; earnedRaw: string; buyers: number; stacks: number; following: boolean };

export default function Social() {
  const api = useApi();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"following" | "discover">("following");
  const feed = useQuery({ queryKey: ["activity", "following"], queryFn: () => api<{ items: Activity[] }>("/api/activity?tab=following"), enabled: tab === "following", refetchInterval: 20_000 });
  const discover = useQuery({
    queryKey: ["activity", "discover"],
    queryFn: () => api<{ byEarnings: Creator[]; byBuyers: Creator[] }>("/api/activity?tab=discover"),
    enabled: tab === "discover",
  });
  const follow = useMutation({
    mutationFn: (c: Creator) => api("/api/follow", { method: c.following ? "DELETE" : "POST", json: { profileId: c.profile.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  return (
    <PullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: ["activity"] })}>
      <div className="px-gutter pt-4">
        <h1 className="text-[28px] font-bold">Social</h1>
        <Tabs
          className="mt-3"
          tabs={[
            { id: "following", label: "Following" },
            { id: "discover", label: "Discover" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "following" ? (
          feed.isLoading ? (
            <div className="pt-3">
              <RowSkeleton count={5} />
            </div>
          ) : feed.isError ? (
            <ErrorState message={(feed.error as Error).message} onRetry={() => feed.refetch()} />
          ) : feed.data?.items.length ? (
            <div className="divide-y divide-border">
              {feed.data.items.map((a) => (
                <ActivityItem key={a.id} a={a} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Users size={24} />} title="Your feed is quiet" body="Follow creators and traders to see their buys, sells and new Stacks here." action={<Button size="md" onClick={() => setTab("discover")}>Discover people</Button>} />
          )
        ) : discover.isLoading ? (
          <div className="pt-3">
            <RowSkeleton count={5} />
          </div>
        ) : discover.isError ? (
          <ErrorState message={(discover.error as Error).message} onRetry={() => discover.refetch()} />
        ) : !discover.data?.byEarnings.length ? (
          <EmptyState icon={<Compass size={24} />} title="No creators yet" body="Creators show up here once their Stacks get bought." />
        ) : (
          <>
            <CreatorList title="Top creators by fees earned" items={discover.data.byEarnings} metric={(c) => `${usd(Number(BigInt(c.earnedRaw)) / 1e18)} earned`} onFollow={(c) => follow.mutate(c)} />
            <CreatorList title="Most Stack buyers" items={discover.data.byBuyers} metric={(c) => `${c.buyers} buyer${c.buyers === 1 ? "" : "s"}`} onFollow={(c) => follow.mutate(c)} />
          </>
        )}
      </div>
    </PullToRefresh>
  );
}

function CreatorList({ title, items, metric, onFollow }: { title: string; items: Creator[]; metric: (c: Creator) => string; onFollow: (c: Creator) => void }) {
  return (
    <section className="mt-5">
      <h2 className="text-section">{title}</h2>
      <ul className="mt-2">
        {items.map((c) => (
          <li key={c.profile.id} className="flex h-row items-center gap-3">
            <Link href={`/app/u/${c.profile.username}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar src={c.profile.avatar_url} name={c.profile.username} size={44} />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold">{c.profile.display_name ?? c.profile.username}</p>
                <p className="truncate text-secondary text-text-muted">
                  @{c.profile.username} · {metric(c)}
                </p>
              </div>
            </Link>
            <Button size="md" variant={c.following ? "secondary" : "primary"} className="h-9 px-4 text-[14px]" onClick={() => onFollow(c)}>
              {c.following ? "Following" : "Follow"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

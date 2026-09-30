"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Compass, Users } from "lucide-react";
import { TokenLogo } from "@/components/ui/TokenLogo";
import Link from "next/link";
import { useState } from "react";
import { ActivityItem } from "@/components/social/ActivityItem";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { usd } from "@/lib/format";
import { useApi } from "@/lib/client/api";
import type { Activity, ProfileLite } from "@/lib/client/types";

type Creator = { profile: ProfileLite; earnedRaw: string; buyers: number; stacks: number; following: boolean };
type StockLeader = { asset: { address: string; ticker: string; name: string; provider: string; logo_url: string | null }; volumeUsd: number; traders: number; trades: number };
type Trader = { profile: ProfileLite; volumeUsd: number; trades: number; following: boolean };
type Discover = { stocks: StockLeader[]; traders: Trader[]; latest: Activity[]; byEarnings: Creator[]; byBuyers: Creator[] };
type Person = { profile: ProfileLite; following: boolean };

export default function Social() {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"following" | "discover">("following");
  const feed = useQuery({ queryKey: ["activity", "following"], queryFn: () => api<{ items: Activity[] }>("/api/activity?tab=following"), enabled: tab === "following", refetchInterval: 20_000 });
  const discover = useQuery({
    queryKey: ["activity", "discover"],
    queryFn: () => api<Discover>("/api/activity?tab=discover"),
    enabled: tab === "discover",
  });
  const follow = useMutation({
    mutationFn: (c: Person) => api("/api/follow", { method: c.following ? "DELETE" : "POST", json: { profileId: c.profile.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (e) => toast({ title: "Couldn't update follow", body: (e as Error).message, tone: "down" }),
  });

  return (
    <PullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: ["activity"] })}>
      <div className="px-gutter pt-4 lg:mx-auto lg:max-w-[760px] lg:px-0 lg:pt-8">
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
            <EmptyState icon={<Users size={24} />} title="Your feed is quiet" body="Follow traders to see what stocks they buy and sell." action={<Button size="md" onClick={() => setTab("discover")}>Discover people</Button>} />
          )
        ) : discover.isLoading ? (
          <div className="pt-3">
            <RowSkeleton count={5} />
          </div>
        ) : discover.isError ? (
          <ErrorState message={(discover.error as Error).message} onRetry={() => discover.refetch()} />
        ) : !discover.data || (!discover.data.stocks.length && !discover.data.traders.length && !discover.data.latest.length && !discover.data.byEarnings.length) ? (
          <EmptyState icon={<Compass size={24} />} title="Nothing to discover yet" body="Stocks and traders show up here once people start trading." />
        ) : (
          <>
            {discover.data.stocks.length > 0 && (
              <section className="mt-5">
                <h2 className="text-section">Most traded stocks this week</h2>
                <ul className="mt-2">
                  {discover.data.stocks.map((s) => (
                    <li key={s.asset.address}>
                      <Link href={`/app/stock/${s.asset.provider}/${s.asset.address}`} className="press -mx-2 flex h-row items-center gap-3 rounded-card px-2 hover:bg-surface/60">
                        <TokenLogo src={s.asset.logo_url} label={s.asset.ticker} size={44} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[16px] font-semibold uppercase">{s.asset.ticker}</p>
                          <p className="truncate text-secondary text-text-muted">{s.asset.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[16px] font-medium tnum">{usd(s.volumeUsd, { compact: s.volumeUsd >= 10_000 })}</p>
                          <p className="text-[12px] text-text-muted">
                            {s.traders} trader{s.traders === 1 ? "" : "s"}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {discover.data.traders.length > 0 && (
              <PeopleList title="Top traders this week" items={discover.data.traders} metric={(t) => `${usd(t.volumeUsd, { compact: t.volumeUsd >= 10_000 })} traded`} onFollow={(t) => follow.mutate(t)} />
            )}
            {discover.data.latest.length > 0 && (
              <section className="mt-5">
                <h2 className="text-section">Latest trades</h2>
                <div className="divide-y divide-border">
                  {discover.data.latest.map((a) => (
                    <ActivityItem key={a.id} a={a} />
                  ))}
                </div>
              </section>
            )}
            {discover.data.byEarnings.length > 0 && (
              <PeopleList title="Basket creators" items={discover.data.byEarnings} metric={(c) => `${usd(Number(BigInt(c.earnedRaw)) / 1e18)} earned · ${c.buyers} buyer${c.buyers === 1 ? "" : "s"}`} onFollow={(c) => follow.mutate(c)} />
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  );
}

function PeopleList<T extends Person>({ title, items, metric, onFollow }: { title: string; items: T[]; metric: (c: T) => string; onFollow: (c: T) => void }) {
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

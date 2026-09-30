"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt, Users } from "lucide-react";
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
import { TokenLogo } from "@/components/ui/TokenLogo";
import { APP_NAME } from "@/lib/constants";
import { timeAgo, usd } from "@/lib/format";
import { useApi } from "@/lib/client/api";
import type { Activity, ProfileLite } from "@/lib/client/types";

type StockLeader = { asset: { address: string; ticker: string; name: string; provider: string; logo_url: string | null }; volumeUsd: number; traders: number; trades: number };
type Trader = { profile: ProfileLite; volumeUsd: number; trades: number; following: boolean };
type Person = { profile: ProfileLite; following: boolean; lastTrade: { side: "buy" | "sell"; label: string; at: string } | null };
type Discover = { stocks: StockLeader[]; traders: Trader[]; latest: Activity[]; people: Person[] };
type Followable = { profile: ProfileLite; following: boolean };

/**
 * Social is about the people on the app and what they trade. Trades: everyone's latest buys and
 * sells. People: the week's most active traders, then everyone else. Following: only the people
 * you follow.
 */
export default function Social() {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"trades" | "people" | "following">("trades");
  const feed = useQuery({ queryKey: ["activity", "following"], queryFn: () => api<{ items: Activity[] }>("/api/activity?tab=following"), enabled: tab === "following", refetchInterval: 20_000 });
  const discover = useQuery({
    queryKey: ["activity", "discover"],
    queryFn: () => api<Discover>("/api/activity?tab=discover"),
    enabled: tab !== "following",
    refetchInterval: tab === "trades" ? 20_000 : false,
  });
  const follow = useMutation({
    mutationFn: (c: Followable) => api("/api/follow", { method: c.following ? "DELETE" : "POST", json: { profileId: c.profile.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (e) => toast({ title: "Couldn't update follow", body: (e as Error).message, tone: "down" }),
  });
  const d = discover.data;

  return (
    <PullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: ["activity"] })}>
      <div className="px-gutter pt-4 lg:mx-auto lg:max-w-[760px] lg:px-0 lg:pt-8">
        <h1 className="text-[28px] font-bold">Social</h1>
        <Tabs
          className="mt-3"
          tabs={[
            { id: "trades", label: "Trades" },
            { id: "people", label: "People" },
            { id: "following", label: "Following" },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "following" ? (
          feed.isLoading ? (
            <Loading />
          ) : feed.isError ? (
            <ErrorState message={(feed.error as Error).message} onRetry={() => feed.refetch()} />
          ) : feed.data?.items.length ? (
            <div className="divide-y divide-border">
              {feed.data.items.map((a) => (
                <ActivityItem key={a.id} a={a} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Users size={24} />}
              title="Your feed is quiet"
              body="Follow traders to see what stocks they buy and sell."
              action={
                <Button size="md" onClick={() => setTab("people")}>
                  Find people
                </Button>
              }
            />
          )
        ) : discover.isLoading ? (
          <Loading />
        ) : discover.isError ? (
          <ErrorState message={(discover.error as Error).message} onRetry={() => discover.refetch()} />
        ) : !d ? null : tab === "trades" ? (
          <>
            {d.stocks.length > 0 && (
              <section className="mt-4">
                <h2 className="text-section">Most traded this week</h2>
                <ul className="no-scrollbar -mx-gutter mt-2 flex gap-2 overflow-x-auto px-gutter lg:mx-0 lg:px-0">
                  {d.stocks.map((s) => (
                    <li key={s.asset.address} className="shrink-0">
                      <Link href={`/app/stock/${s.asset.provider}/${s.asset.address}`} className="press flex items-center gap-2.5 rounded-chip bg-surface py-2 pl-2 pr-3.5">
                        <TokenLogo src={s.asset.logo_url} label={s.asset.ticker} size={32} />
                        <span>
                          <span className="block text-[15px] font-semibold uppercase leading-tight">{s.asset.ticker}</span>
                          <span className="block text-[12px] leading-tight text-text-muted tnum">
                            {usd(s.volumeUsd, { compact: s.volumeUsd >= 10_000 })} · {s.traders} trader{s.traders === 1 ? "" : "s"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="mt-5">
              <h2 className="text-section">Latest trades</h2>
              {d.latest.length ? (
                <div className="divide-y divide-border">
                  {d.latest.map((a) => (
                    <ActivityItem key={a.id} a={a} />
                  ))}
                </div>
              ) : (
                <EmptyState icon={<Receipt size={24} />} title="No trades this week" body={`Buys and sells by people on ${APP_NAME} show up here.`} />
              )}
            </section>
          </>
        ) : !d.traders.length && !d.people.length ? (
          <EmptyState icon={<Users size={24} />} title="No one here yet" body={`People show up here as they join ${APP_NAME}.`} />
        ) : (
          <>
            {d.traders.length > 0 && (
              <PeopleList
                title="Most active this week"
                items={d.traders}
                detail={(t) => `${usd(t.volumeUsd, { compact: t.volumeUsd >= 10_000 })} traded · ${t.trades} trade${t.trades === 1 ? "" : "s"}`}
                onFollow={(t) => follow.mutate(t)}
              />
            )}
            {d.people.length > 0 && (
              <PeopleList
                title={`On ${APP_NAME}`}
                items={d.people}
                detail={(p) => (p.lastTrade ? `${p.lastTrade.side === "buy" ? "Bought" : "Sold"} ${p.lastTrade.label} · ${timeAgo(p.lastTrade.at)}` : "No trades this week")}
                onFollow={(p) => follow.mutate(p)}
              />
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  );
}

function Loading() {
  return (
    <div className="pt-3">
      <RowSkeleton count={5} />
    </div>
  );
}

function PeopleList<T extends Followable>({ title, items, detail, onFollow }: { title: string; items: T[]; detail: (c: T) => string; onFollow: (c: T) => void }) {
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
                  @{c.profile.username} · {detail(c)}
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

"use client";

import { useQuery } from "@tanstack/react-query";
import { Crown, Trophy } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Bar } from "@/components/ui/Skeleton";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { cn } from "@/lib/cn";
import { usd } from "@/lib/format";
import { useApi } from "@/lib/client/api";
import type { ActivityTarget, ProfileLite } from "@/lib/client/types";

type Weekly = { profile: ProfileLite; gainUsd: number; target: ActivityTarget };
type Hof = { stack: { id: number; ticker: string; name: string; image_url: string | null }; creator: ProfileLite | null; earnedRaw: string };

/**
 * Two-page horizontal pager (UI_SPEC §3.3): Weekly Top Trades, then Hall of Fame. Cards 170px,
 * snap, third card cut off at the edge. Title follows the page.
 */
export function TopTrades() {
  const api = useApi();
  const [page, setPage] = useState(0);
  const pager = useRef<HTMLDivElement>(null);
  const weekly = useQuery({ queryKey: ["leaderboard", "weekly"], queryFn: () => api<{ items: Weekly[] }>("/api/leaderboard?kind=weekly") });
  const hof = useQuery({ queryKey: ["leaderboard", "hof"], queryFn: () => api<{ items: Hof[] }>("/api/leaderboard?kind=hall-of-fame") });

  const onScroll = () => {
    const el = pager.current;
    if (!el) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  };
  const go = (i: number) => pager.current?.scrollTo({ left: i * pager.current.clientWidth, behavior: "smooth" });

  return (
    <section className="mt-6 lg:mt-0">
      <div className="flex items-center justify-between px-gutter">
        <h2 className="flex items-center gap-2 text-section">
          {page === 0 ? <Trophy size={18} className="text-warn" /> : <Crown size={18} className="text-warn" />}
          {page === 0 ? "Weekly Top Trades" : "Hall of Fame"}
        </h2>
        <div className="flex gap-1.5" role="tablist" aria-label="Leaderboard page">
          {[0, 1].map((i) => (
            <button key={i} role="tab" aria-selected={page === i} aria-label={i === 0 ? "Weekly Top Trades" : "Hall of Fame"} onClick={() => go(i)} className={cn("h-1.5 rounded-full transition-all", page === i ? "w-4 bg-text" : "w-1.5 bg-text-dim")} />
          ))}
        </div>
      </div>
      <div ref={pager} onScroll={onScroll} className="no-scrollbar mt-3 flex snap-x snap-mandatory overflow-x-auto">
        <Page>
          {weekly.isLoading ? (
            <CardSkeletons />
          ) : weekly.data?.items.length ? (
            weekly.data.items.map((w) => (
              <Card
                key={w.profile.id}
                href={w.target?.kind === "stack" ? `/app/basket/${w.target.stack.id}` : w.target?.kind === "asset" ? `/app/stock/${w.target.asset.provider}/${w.target.asset.address}` : `/app/u/${w.profile.username}`}
                person={w.profile}
                logo={w.target?.kind === "stack" ? w.target.stack.image_url : w.target?.kind === "asset" ? w.target.asset.logo_url : null}
                logoLabel={w.target?.kind === "stack" ? w.target.stack.ticker : w.target?.kind === "asset" ? w.target.asset.ticker : "?"}
                basket={w.target?.kind === "stack" ? w.target.stack.ticker : null}
                value={usd(w.gainUsd, { sign: true })}
              />
            ))
          ) : (
            <EmptyCard text="No gains this week yet. Top trades show up here." />
          )}
        </Page>
        <Page>
          {hof.isLoading ? (
            <CardSkeletons />
          ) : hof.data?.items.length ? (
            hof.data.items.map((h) => (
              <Card
                key={h.stack.id}
                href={`/app/basket/${h.stack.id}`}
                person={h.creator ?? { id: "", username: "unknown", display_name: null, avatar_url: null }}
                logo={h.stack.image_url}
                logoLabel={h.stack.ticker}
                basket={h.stack.ticker}
                value={`+${usd(Number(BigInt(h.earnedRaw)) / 1e18)}`}
              />
            ))
          ) : (
            <EmptyCard text="Baskets that earn their creators the most fees land here." />
          )}
        </Page>
      </div>
    </section>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full shrink-0 snap-start">
      <div className="no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-gutter">{children}</div>
    </div>
  );
}

function Card({ href, person, logo, logoLabel, basket, value }: { href: string; person: ProfileLite; logo: string | null; logoLabel: string; basket?: string | null; value: string }) {
  return (
    <Link href={href} className="press w-[170px] shrink-0 snap-start overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Avatar src={person.avatar_url} name={person.username} size={24} />
        <span className="truncate text-[15px] font-medium">{person.username}</span>
      </div>
      <div className="h-px bg-border" />
      <div className="flex items-center gap-2 px-3 py-3">
        <TokenLogo src={logo} label={logoLabel} basket={basket} size={28} />
        <span className="truncate text-[17px] font-semibold text-up tnum">{value}</span>
      </div>
    </Link>
  );
}

function CardSkeletons() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="w-[170px] shrink-0 rounded-card border border-border bg-surface p-3">
          <Bar className="h-6 w-24" />
          <Bar className="mt-4 h-7 w-28" />
        </div>
      ))}
    </>
  );
}

function EmptyCard({ text }: { text: string }) {
  return <div className="flex h-[94px] w-full items-center rounded-card border border-dashed border-border px-4 text-secondary text-text-muted">{text}</div>;
}

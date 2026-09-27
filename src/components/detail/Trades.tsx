"use client";

import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { TradeMarker } from "@/components/chart/PriceChart";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { price, timeAgo, usd } from "@/lib/format";
import { useApi } from "@/lib/client/api";
import type { ProfileLite } from "@/lib/client/types";

export type PublicTrade = { id: number; side: "buy" | "sell"; usd: number; price: number | null; at: string; trader: ProfileLite | null; isMe: boolean; isFriend: boolean };
export type Overlay = "all" | "friends" | "mine" | "off";

/** StacksClub users' trades in one stock or Stack, plus chart markers filtered by overlay. */
export function useTrades(targetType: "asset" | "stack", targetId: string) {
  const api = useApi();
  const [overlay, setOverlay] = useState<Overlay>("all");
  const q = useQuery({
    queryKey: ["public-trades", targetType, targetId],
    queryFn: () => api<{ items: PublicTrade[] }>(`/api/trades/public?targetType=${targetType}&targetId=${targetId}`),
    refetchInterval: 15_000,
  });
  const markers: TradeMarker[] = useMemo(() => {
    if (overlay === "off") return [];
    return (q.data?.items ?? [])
      .filter((t) => overlay === "all" || (overlay === "mine" ? t.isMe : t.isFriend))
      .map((t) => ({ t: new Date(t.at).getTime(), side: t.side, label: t.trader?.username ?? "" }));
  }, [q.data, overlay]);
  return { trades: q.data?.items ?? [], loading: q.isLoading, overlay, setOverlay, markers };
}

export function OverlayToggle({ value, onChange }: { value: Overlay; onChange: (o: Overlay) => void }) {
  const opts: [Overlay, string][] = [
    ["all", "Everyone"],
    ["friends", "Friends"],
    ["mine", "Mine"],
    ["off", "Off"],
  ];
  return (
    <div className="flex items-center gap-2 px-gutter pt-3 lg:px-0">
      <span className="text-[12px] text-text-muted">Trades on chart</span>
      <div role="radiogroup" aria-label="Trades on chart" className="flex rounded-chip bg-surface p-0.5">
        {opts.map(([id, label]) => (
          <button
            key={id}
            role="radio"
            aria-checked={value === id}
            onClick={() => onChange(id)}
            className={cn("h-7 rounded-[10px] px-2.5 text-[12px] font-semibold", value === id ? "bg-surface-2 text-text" : "text-text-muted hover:text-text")}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Live trades by StacksClub users (fomo-style), newest first. */
export function TradesFeed({ trades, loading, className }: { trades: PublicTrade[]; loading: boolean; className?: string }) {
  return (
    <div className={className}>
      {loading ? (
        <p className="py-6 text-center text-[14px] text-text-muted">Loading trades…</p>
      ) : !trades.length ? (
        <EmptyState icon={<Receipt size={22} />} title="No trades yet" body="Buys and sells by StacksClub users show up here." />
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] text-text-muted">
              <th className="py-2 font-medium">Trader</th>
              <th className="py-2 font-medium">Side</th>
              <th className="py-2 text-right font-medium">Amount</th>
              <th className="py-2 text-right font-medium">Price</th>
              <th className="py-2 text-right font-medium">Age</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id} className="border-t border-border/60">
                <td className="py-2">
                  <Link href={t.trader ? `/app/u/${t.trader.username}` : "#"} className="flex min-w-0 items-center gap-2">
                    <Avatar src={t.trader?.avatar_url} name={t.trader?.username} size={22} />
                    <span className="truncate font-medium">{t.trader?.username ?? "user"}</span>
                    {t.isMe && <span className="text-[10px] text-text-muted">you</span>}
                  </Link>
                </td>
                <td className="py-2">
                  <span className={cn("rounded-badge px-1.5 py-0.5 text-[11px] font-semibold capitalize", t.side === "buy" ? "bg-up/15 text-up" : "bg-down/15 text-down")}>{t.side}</span>
                </td>
                <td className="py-2 text-right font-medium tnum">{usd(t.usd)}</td>
                <td className="py-2 text-right text-text-muted tnum">{price(t.price)}</td>
                <td className="py-2 text-right text-text-muted">{timeAgo(t.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Desktop stats strip under the header. */
export function StatsStrip({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="mt-5 hidden grid-cols-3 gap-2 xl:grid-cols-6 lg:grid">
      {items.map((i) => (
        <div key={i.label} className="rounded-chip border border-border bg-surface px-3 py-2.5">
          <dt className="text-[11px] text-text-muted">{i.label}</dt>
          <dd className="mt-0.5 truncate text-[15px] font-semibold tnum">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

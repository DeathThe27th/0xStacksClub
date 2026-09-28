"use client";

import { useQuery } from "@tanstack/react-query";
import { Users, Wallet } from "lucide-react";
import Link from "next/link";
import { TopTrades } from "@/components/market/TopTrades";
import { ActivityItem } from "@/components/social/ActivityItem";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";
import { Change } from "@/components/ui/Change";
import { Bar } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/States";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { cn } from "@/lib/cn";
import { PROVIDER_LABEL, type Provider } from "@/lib/constants";
import { price, units, usd } from "@/lib/format";
import { useApi } from "@/lib/client/api";
import { usePortfolio } from "@/lib/client/queries";
import type { Activity } from "@/lib/client/types";

/** Desktop, top of your own profile: your portfolio, holdings, the leaderboard and your people's activity. */
export function Overview({ onDeposit }: { onDeposit: () => void }) {
  const api = useApi();
  const p = usePortfolio({ poll: 20_000 });
  const feed = useQuery({ queryKey: ["activity", "following"], queryFn: () => api<{ items: Activity[] }>("/api/activity?tab=following"), refetchInterval: 20_000 });
  const d = p.data;
  const stocksValue = d?.holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0) ?? 0;
  const stacksValue = d?.positions.reduce((s, x) => s + (x.valueUsd ?? 0), 0) ?? 0;
  const change = d?.change24hUsd ?? 0;

  return (
    <div className="space-y-6 py-6">
      <section className="rounded-card border border-border bg-surface p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[13px] font-medium text-text-muted">Portfolio value</p>
            {p.isLoading ? (
              <Bar className="mt-2 h-11 w-48" />
            ) : (
              <p className="mt-1 text-[44px] font-bold leading-none tracking-[-0.02em] tnum">
                {d?.totalUsd == null ? (
                  "—"
                ) : (
                  <AnimatedNumber
                    value={d.totalUsd}
                    format={(n) => {
                      const [a, b] = usd(n).split(".");
                      return (
                        <>
                          {a}
                          <span className="text-text-dim">.{b}</span>
                        </>
                      );
                    }}
                  />
                )}
              </p>
            )}
            <p className={cn("mt-2 text-[15px] font-medium tnum", change > 0 ? "text-up" : change < 0 ? "text-down" : "text-text-muted")}>
              {usd(change, { sign: true })} <span className="text-text-muted">today</span>
            </p>
          </div>
          <Button onClick={onDeposit} className="w-[160px]">
            Deposit
          </Button>
        </div>
        <dl className="mt-6 grid grid-cols-4 gap-3">
          {[
            ["USDT cash", d ? usd(d.usdt.display) : "—"],
            ["Stocks", d ? usd(stocksValue) : "—"],
            ["Stacks", d ? usd(stacksValue) : "—"],
            ["BNB for gas", d ? `${d.bnb.display.toFixed(4)} BNB` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-chip bg-surface-2 px-4 py-3">
              <dt className="text-[12px] text-text-muted">{k}</dt>
              <dd className="mt-0.5 text-[17px] font-semibold tnum">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-card border border-border bg-surface">
        <h2 className="px-5 pt-5 text-section">Your holdings</h2>
        {!d ? (
          <div className="p-5">
            <Bar className="h-10 w-full" />
          </div>
        ) : !d.holdings.length && !d.positions.length ? (
          <EmptyState icon={<Wallet size={24} />} title="Nothing here yet" body="Deposit USDT, then pick a stock or a Stack from the list on the left." />
        ) : (
          <table className="mt-3 w-full text-[14px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-text-muted">
                <th className="px-5 py-2 font-medium">Asset</th>
                <th className="py-2 text-right font-medium">Holding</th>
                <th className="py-2 text-right font-medium">Price</th>
                <th className="py-2 text-right font-medium">Value</th>
                <th className="py-2 text-right font-medium">24h</th>
                <th className="px-5 py-2 text-right font-medium">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {d.positions.map((x) => (
                <tr key={`p${x.id}`} className="border-b border-border/60 last:border-0 hover:bg-surface-2/60">
                  <td className="px-5 py-3">
                    <Link href={`/app/position/${x.id}`} className="flex items-center gap-3">
                      <TokenLogo src={x.stackImage} label={x.stackTicker ?? "?"} size={32} />
                      <span>
                        <span className="block font-semibold">${x.stackTicker}</span>
                        <span className="block text-[12px] text-text-muted">Position #{x.id} · {x.components.length} stocks</span>
                      </span>
                    </Link>
                  </td>
                  <td className="py-3 text-right text-text-muted">Stack</td>
                  <td className="py-3 text-right text-text-muted">—</td>
                  <td className="py-3 text-right font-medium tnum">{usd(x.valueUsd)}</td>
                  <td className="py-3 text-right text-text-muted">—</td>
                  <td className="px-5 py-3 text-right">
                    <Change value={x.pnlPct} className="justify-end" />
                  </td>
                </tr>
              ))}
              {d.holdings.map((h) => (
                <tr key={h.address} className="border-b border-border/60 last:border-0 hover:bg-surface-2/60">
                  <td className="px-5 py-3">
                    <Link href={`/app/stock/${h.provider}/${h.address}`} className="flex items-center gap-3">
                      <TokenLogo src={h.logoUrl} label={h.ticker} size={32} />
                      <span>
                        <span className="block font-semibold">{h.ticker}</span>
                        <span className="block text-[12px] text-text-muted">{PROVIDER_LABEL[h.provider as Provider]}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="py-3 text-right tnum">{units(h.unitsDisplay, 4)}</td>
                  <td className="py-3 text-right tnum">{price(h.price)}</td>
                  <td className="py-3 text-right font-medium tnum">{usd(h.valueUsd)}</td>
                  <td className="py-3 text-right">
                    <Change value={h.change24h} className="justify-end" />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Change value={h.pnlPct} className="justify-end" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid grid-cols-2 gap-6">
        <section className="rounded-card border border-border bg-surface pb-5 pt-5">
          <TopTrades />
        </section>
        <section className="rounded-card border border-border bg-surface p-5">
          <h2 className="text-section">Following</h2>
          {feed.isLoading ? (
            <Bar className="mt-4 h-12 w-full" />
          ) : feed.data?.items.length ? (
            <div className="mt-1 max-h-[360px] divide-y divide-border overflow-y-auto">
              {feed.data.items.slice(0, 20).map((a) => (
                <ActivityItem key={a.id} a={a} />
              ))}
            </div>
          ) : (
            <div className="py-6 text-center">
              <Users size={22} className="mx-auto text-text-muted" />
              <p className="mt-2 text-[14px] text-text-muted">Follow traders and creators to see their moves.</p>
              <Link href="/app/social" className="mt-3 inline-block text-[14px] font-semibold text-link">
                Discover people
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

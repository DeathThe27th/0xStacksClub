"use client";

import { Gift } from "lucide-react";
import Link from "next/link";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { BentoGrid, BentoHero, BentoTile } from "@/components/ui/Bento";
import { Bar } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { pct, usd } from "@/lib/format";
import { useAssets, useMe, usePortfolio } from "@/lib/client/queries";

type Mover = { key: string; label: string; change: number };

/** Desktop Home: portfolio at a glance, as a bento grid. Every number is live. */
export function PortfolioBento({ onDeposit }: { onDeposit: () => void }) {
  const p = usePortfolio({ poll: 20_000 });
  const me = useMe();
  const market = useAssets("stocks", "trending");
  const d = p.data;
  const change = d?.change24hUsd ?? 0;
  const prev = d?.totalUsd != null ? d.totalUsd - change : null;
  const changePct = prev && prev > 0 ? (change / prev) * 100 : null;

  // Your holdings' 24h moves; if you hold nothing yet, the most active tradable stocks.
  const mine: Mover[] = (d?.holdings ?? []).filter((h) => h.change24h !== null).map((h) => ({ key: h.address, label: h.ticker, change: h.change24h! }));
  const marketMovers: Mover[] = (market.data?.items ?? [])
    .filter((a) => a.price?.change_24h != null)
    .slice(0, 12)
    .map((a) => ({ key: a.address, label: a.ticker, change: Number(a.price!.change_24h) }));
  const ownMovers = mine.length > 0;
  const movers = (ownMovers ? mine : marketMovers).slice(0, 12);
  const maxAbs = Math.max(0.5, ...movers.map((m) => Math.abs(m.change)));
  const upCount = movers.filter((m) => m.change >= 0).length;

  const claimable = me.data?.claimableRaw ? Number(BigInt(me.data.claimableRaw)) / 1e18 : 0;

  return (
    <BentoGrid>
      <BentoHero>
        <div>
          <p className="text-[14px] font-medium text-white/70">Portfolio value</p>
          {p.isLoading ? (
            <Bar className="mt-3 h-14 w-56 bg-white/20" />
          ) : (
            <p className="mt-2 text-[56px] font-bold leading-none tracking-[-0.03em] tnum">
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
                        <span className="text-white/50">.{b}</span>
                      </>
                    );
                  }}
                />
              )}
            </p>
          )}
          <p className="mt-3 text-[15px] font-medium tnum text-white/85">
            {usd(change, { sign: true })}
            {changePct !== null && <span className="text-white/60"> ({change >= 0 ? "+" : "-"}{pct(changePct)})</span>} today
          </p>
        </div>
        <div className="flex items-end justify-between gap-4">
          <p className="max-w-[26ch] text-[14px] text-white/70">
            {d ? `${d.holdings.length} stock${d.holdings.length === 1 ? "" : "s"} and ${d.positions.length} Stack position${d.positions.length === 1 ? "" : "s"}, valued at live onchain marks.` : " "}
          </p>
        </div>
      </BentoHero>

      <BentoTile className="flex items-center justify-between gap-6 md:col-span-3" tone="surface-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-text-muted">{ownMovers ? "Your movers today" : "Top stocks today"}</p>
          <p className="mt-1 text-[28px] font-semibold leading-tight tnum">
            {movers.length ? (
              <>
                {upCount}
                <span className="text-text-muted"> up · </span>
                {movers.length - upCount}
                <span className="text-text-muted"> down</span>
              </>
            ) : (
              "—"
            )}
          </p>
        </div>
        <div className="flex h-16 items-end gap-1.5" role="img" aria-label="24 hour change per stock">
          {movers.map((m) => (
            <div key={m.key} className="group relative flex h-full flex-col justify-end">
              <div
                className={cn("w-2 rounded-full", m.change >= 0 ? "bg-up" : "bg-down")}
                style={{ height: `${Math.max(10, (Math.abs(m.change) / maxAbs) * 100)}%` }}
              />
              <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-text px-1.5 py-0.5 text-[11px] font-medium text-bg group-hover:block">
                {m.label} {m.change >= 0 ? "+" : "-"}
                {pct(m.change)}
              </span>
            </div>
          ))}
        </div>
      </BentoTile>

      <BentoTile className="flex flex-col justify-center md:col-span-1">
        <p className={cn("text-[22px] font-semibold leading-none tnum", d && d.bnb.display < 0.0005 && "text-warn")}>{d ? d.bnb.display.toFixed(4) : "—"}</p>
        <p className="mt-2 text-[13px] font-medium text-text-muted">BNB for gas</p>
        {d && d.bnb.display < 0.0005 && (
          <button onClick={onDeposit} className="mt-1 text-left text-[12px] font-semibold text-link">
            Top up
          </button>
        )}
      </BentoTile>

      <Link href={me.data?.profile ? `/app/u/${me.data.profile.username}` : "/app"} className="press flex items-center gap-4 rounded-[24px] border border-border bg-surface-2 p-6 hover:bg-border/50 md:col-span-2">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-bg text-link shadow-[0_1px_2px_rgb(0_0_0/0.12)]">
          <Gift size={20} />
        </span>
        <span className="min-w-0">
          <span className="block text-[17px] font-semibold leading-none tnum">{usd(claimable)} creator fees</span>
          <span className="mt-1.5 block text-[13px] text-text-muted">
            {claimable > 0 ? "Ready to claim on your profile" : "Earn 25% of the buy fee when people buy your Stacks"}
          </span>
        </span>
      </Link>
    </BentoGrid>
  );
}

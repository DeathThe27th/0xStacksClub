"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Layers, Star } from "lucide-react";
import { useState } from "react";
import { Mark } from "@/components/brand/Mark";
import { AssetRow, StackRow } from "@/components/market/Rows";
import { TopTrades } from "@/components/market/TopTrades";
import { DepositSheet } from "@/components/trade/DepositSheet";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";
import { Chips } from "@/components/ui/Chips";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { Sheet } from "@/components/ui/Sheet";
import { Bar, RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { cn } from "@/lib/cn";
import { usd } from "@/lib/format";
import { useAssets, usePortfolio, useStacks } from "@/lib/client/queries";

type TabId = "watchlist" | "stocks" | "stacks";
const stockChips = [
  { id: "trending", label: "Trending" },
  { id: "most_held", label: "Most held" },
  { id: "top_gainers", label: "Top gainers" },
] as const;
const stackChips = [
  { id: "trending", label: "Trending" },
  { id: "newest", label: "Newest" },
  { id: "most_held", label: "Most held" },
  { id: "top_performers", label: "Top performers" },
] as const;

export default function Home() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>("stocks");
  const [stockFilter, setStockFilter] = useState<(typeof stockChips)[number]["id"]>("trending");
  const [stackFilter, setStackFilter] = useState<(typeof stackChips)[number]["id"]>("trending");
  const [sort, setSort] = useState<"change" | "market_cap" | "volume" | undefined>();
  const [sortOpen, setSortOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);

  return (
    <PullToRefresh onRefresh={() => qc.invalidateQueries()}>
      <header className="px-gutter pt-4">
        <Mark size={32} className="text-text" />
      </header>

      <Balance onDeposit={() => setDepositOpen(true)} />
      <TopTrades />

      <div className="mt-6 px-gutter">
        <Tabs<TabId>
          tabs={[
            { id: "watchlist", label: (<><Star size={16} /> Watchlist</>) },
            { id: "stocks", label: "Stocks" },
            { id: "stacks", label: "Stacks", badge: "New" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "stocks" && <Chips chips={[...stockChips]} value={stockFilter} onChange={setStockFilter} onFilter={() => setSortOpen(true)} />}
        {tab === "stacks" && <Chips chips={[...stackChips]} value={stackFilter} onChange={setStackFilter} />}
        <div className={cn(tab === "watchlist" && "pt-2")}>
          {tab === "stacks" ? <StackList filter={stackFilter} /> : <AssetList tab={tab} filter={stockFilter} sort={sort} />}
        </div>
      </div>

      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title="Sort by">
        <div className="space-y-2">
          {([
            [undefined, "Default"],
            ["change", "Price change"],
            ["market_cap", "Market cap"],
            ["volume", "Volume"],
          ] as const).map(([v, label]) => (
            <button
              key={label}
              onClick={() => {
                setSort(v);
                setSortOpen(false);
              }}
              className={cn("press flex h-14 w-full items-center justify-between rounded-card bg-surface-2 px-4 text-[16px]", sort === v && "font-semibold")}
            >
              {label}
              {sort === v && <span className="h-2 w-2 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      </Sheet>
      <DepositSheet open={depositOpen} onClose={() => setDepositOpen(false)} />
    </PullToRefresh>
  );
}

/** Balance block (UI_SPEC §3.2): dollars in text, cents in text-dim, 24h change, Deposit button. */
function Balance({ onDeposit }: { onDeposit: () => void }) {
  const p = usePortfolio({ poll: 20_000 });
  const total = p.data?.totalUsd ?? null;
  const change = p.data?.change24hUsd ?? null;
  return (
    <section className="mt-5 flex items-center justify-between gap-4 px-gutter">
      <div className="min-w-0">
        {p.isLoading ? (
          <Bar className="h-11 w-32" />
        ) : (
          <p className="truncate text-balance tnum" aria-label={`Balance ${usd(total)}`}>
            {total === null ? (
              <span className="text-text-dim">—</span>
            ) : (
              <AnimatedNumber
                value={total}
                format={(n) => {
                  const [dollars, cents] = usd(n).split(".");
                  return (
                    <>
                      {dollars}
                      <span className="text-text-dim">.{cents}</span>
                    </>
                  );
                }}
              />
            )}
          </p>
        )}
        <p className="mt-1 text-[15px] font-medium tnum">
          {p.isLoading ? (
            <Bar className="h-4 w-24" />
          ) : (
            <>
              <span className={cn(change === null || change === 0 ? "text-text-muted" : change > 0 ? "text-up" : "text-down")}>{usd(change ?? 0, { sign: true })}</span>{" "}
              <span className="text-text-muted">24h</span>
            </>
          )}
        </p>
      </div>
      <Button className="h-14 w-[140px] shrink-0" onClick={onDeposit}>
        Deposit
      </Button>
    </section>
  );
}

function AssetList({ tab, filter, sort }: { tab: "watchlist" | "stocks"; filter: string; sort?: string }) {
  const q = useAssets(tab, filter, sort);
  if (q.isLoading) return <RowSkeleton />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data?.items.length) {
    return tab === "watchlist" ? (
      <EmptyState icon={<Star size={24} />} title="Nothing watched yet" body="Tap the star on any stock to watch it" />
    ) : (
      <EmptyState icon={<Layers size={24} />} title="No stocks here yet" body="The catalog fills in once assets are seeded." />
    );
  }
  return (
    <div>
      {q.data.items.map((a) => (
        <AssetRow key={a.address} a={a} />
      ))}
    </div>
  );
}

function StackList({ filter }: { filter: string }) {
  const q = useStacks(filter);
  if (q.isLoading) return <RowSkeleton />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data?.items.length) {
    return <EmptyState icon={<Layers size={24} />} title="No Stacks yet" body="Be the first to build one from 2 to 5 stocks." />;
  }
  return (
    <div>
      {q.data.items.map((s) => (
        <StackRow key={s.id} s={s} />
      ))}
    </div>
  );
}

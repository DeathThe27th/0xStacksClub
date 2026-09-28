"use client";

import { Layers, Star } from "lucide-react";
import { useState } from "react";
import { AssetRow, BasketRow } from "@/components/market/Rows";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";
import { Chips } from "@/components/ui/Chips";
import { Sheet } from "@/components/ui/Sheet";
import { Bar, RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { cn } from "@/lib/cn";
import { usd } from "@/lib/format";
import { useAssets, usePortfolio, useStacks } from "@/lib/client/queries";

export type TabId = "stocks" | "baskets";
type StockFilter = "trending" | "watchlist" | "most_held" | "top_gainers";
// Only Trending and Watchlist sit in the chip row; the rest live in the filter sheet.
const stockChips: { id: StockFilter; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "watchlist", label: "Watchlist" },
];
const stockSheetFilters: { id: StockFilter; label: string }[] = [
  { id: "most_held", label: "Most held" },
  { id: "top_gainers", label: "Top gainers" },
];
const stackChips = [
  { id: "trending", label: "Trending" },
  { id: "newest", label: "Newest" },
  { id: "most_held", label: "Most held" },
  { id: "top_performers", label: "Top performers" },
] as const;


/**
 * Market tabs: Stocks (Trending and Watchlist chips; Most held, Top gainers and sort in the filter
 * sheet) and Baskets. The phone Home list and the desktop left pane.
 */
export function MarketTabs({ className }: { className?: string }) {
  const [tab, setTab] = useState<TabId>("stocks");
  const [stockFilter, setStockFilter] = useState<StockFilter>("trending");
  const [stackFilter, setStackFilter] = useState<(typeof stackChips)[number]["id"]>("trending");
  const [sort, setSort] = useState<"change" | "market_cap" | "volume" | undefined>();
  const [sortOpen, setSortOpen] = useState(false);
  return (
    <div className={className}>
      <Tabs<TabId>
        tabs={[
          { id: "stocks", label: "Stocks" },
          { id: "baskets", label: "Baskets" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "stocks" && (
        // Desktop shows the filter as a dropdown under this row; phone keeps the bottom sheet.
        <div className="relative">
          <Chips
            chips={stockChips}
            value={stockFilter}
            onChange={setStockFilter}
            onFilter={() => setSortOpen((o) => !o)}
            filterActive={sort !== undefined || stockSheetFilters.some((f) => f.id === stockFilter)}
          />
          <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title="Filter" anchor="left" className="w-full">
            <p className="mb-2 text-secondary font-semibold text-text-muted">Show</p>
            <div className="space-y-2">
              {stockSheetFilters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setStockFilter(stockFilter === f.id ? "trending" : f.id);
                    setSortOpen(false);
                  }}
                  className={cn("press flex h-14 w-full items-center justify-between rounded-card bg-surface-2 px-4 text-[16px] lg:h-11 lg:text-[15px]", stockFilter === f.id && "font-semibold")}
                >
                  {f.label}
                  {stockFilter === f.id && <span className="h-2 w-2 rounded-full bg-primary" />}
                </button>
              ))}
            </div>
            <p className="mb-2 mt-5 text-secondary font-semibold text-text-muted">Sort by</p>
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
                  className={cn("press flex h-14 w-full items-center justify-between rounded-card bg-surface-2 px-4 text-[16px] lg:h-11 lg:text-[15px]", sort === v && "font-semibold")}
                >
                  {label}
                  {sort === v && <span className="h-2 w-2 rounded-full bg-primary" />}
                </button>
              ))}
            </div>
          </Sheet>
        </div>
      )}
      {tab === "baskets" && <Chips chips={[...stackChips]} value={stackFilter} onChange={setStackFilter} />}
      <div>
        {tab === "baskets" ? (
          <StackList filter={stackFilter} />
        ) : stockFilter === "watchlist" ? (
          <AssetList tab="watchlist" filter="trending" sort={sort} />
        ) : (
          <AssetList tab="stocks" filter={stockFilter} sort={sort} />
        )}
      </div>
    </div>
  );
}

/** Balance block (UI_SPEC §3.2): dollars in text, cents in text-dim, 24h change, Deposit button. */
export function Balance({ onDeposit }: { onDeposit: () => void }) {
  const p = usePortfolio({ poll: 20_000 });
  const total = p.data?.totalUsd ?? null;
  const change = p.data?.change24hUsd ?? null;
  return (
    <section className="rb-aqua rb-block mt-5 flex items-center justify-between gap-4 px-gutter">
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
    return <EmptyState icon={<Layers size={24} />} title="No baskets yet" body="Be the first to build one from 2 to 5 stocks." />;
  }
  return (
    <div>
      {q.data.items.map((s) => (
        <BasketRow key={s.id} s={s} />
      ))}
    </div>
  );
}

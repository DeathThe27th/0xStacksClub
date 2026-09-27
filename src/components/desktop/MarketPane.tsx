"use client";

import { MarketTabs } from "@/components/market/MarketTabs";

/** Desktop left pane: the market list stays in view while you browse stocks, Stacks and Clubs. */
export function MarketPane() {
  return (
    <aside className="no-scrollbar sticky top-16 hidden h-[calc(100dvh-64px)] w-[360px] shrink-0 overflow-y-auto border-r border-border px-4 pb-8 pt-4 lg:block">
      <MarketTabs />
    </aside>
  );
}

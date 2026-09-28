"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Overview } from "@/components/desktop/Overview";
import { Balance, MarketTabs } from "@/components/market/MarketTabs";
import { TopTrades } from "@/components/market/TopTrades";
import { DepositSheet } from "@/components/trade/DepositSheet";
import { PullToRefresh } from "@/components/ui/PullToRefresh";

export default function Home() {
  const qc = useQueryClient();
  const [depositOpen, setDepositOpen] = useState(false);
  return (
    <>
      {/* Phone: the spec's Home. */}
      <div className="lg:hidden">
        <PullToRefresh onRefresh={() => qc.invalidateQueries()}>
          <header className="px-gutter pt-4">
            <Wordmark size={26} />
          </header>
          <Balance onDeposit={() => setDepositOpen(true)} />
          <TopTrades />
          <MarketTabs className="mt-6 px-gutter" />
        </PullToRefresh>
      </div>
      {/* Desktop: the market list lives in the left pane; the centre is your overview. */}
      <div className="hidden lg:block">
        <Overview onDeposit={() => setDepositOpen(true)} />
      </div>
      <DepositSheet open={depositOpen} onClose={() => setDepositOpen(false)} />
    </>
  );
}

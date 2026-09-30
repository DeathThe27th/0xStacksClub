"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Balance, MarketTabs } from "@/components/market/MarketTabs";
import { IMessageCard } from "@/components/profile/IMessageCard";
import { TopTrades } from "@/components/market/TopTrades";
import { DepositSheet } from "@/components/trade/DepositSheet";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { Bar } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useIsDesktop } from "@/lib/client/media";
import { useAssets } from "@/lib/client/queries";

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
          <IMessageCard className="mx-gutter mt-4" />
          <TopTrades />
          <MarketTabs className="mt-6 px-gutter" />
        </PullToRefresh>
      </div>
      {/* Desktop: open straight onto the first stock in the list; your overview lives on your profile. */}
      <div className="hidden lg:block">
        <FirstStock />
      </div>
      <DepositSheet open={depositOpen} onClose={() => setDepositOpen(false)} />
    </>
  );
}

function FirstStock() {
  const desktop = useIsDesktop();
  const router = useRouter();
  // Same query as the left pane's default Trending list, so this reads from its cache.
  const q = useAssets("stocks", "trending");
  const first = q.data?.items[0];
  useEffect(() => {
    if (desktop && first) router.replace(`/app/stock/${first.provider}/${first.address}`);
  }, [desktop, first, router]);

  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (q.data && !first) return <EmptyState icon={<Layers size={24} />} title="No stocks here yet" body="The catalog fills in once assets are seeded." />;
  return (
    <div className="space-y-4 pt-5">
      <Bar className="h-10 w-56" />
      <Bar className="h-9 w-40" />
      <Bar className="h-[420px] w-full" />
    </div>
  );
}

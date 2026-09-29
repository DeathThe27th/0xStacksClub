"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { SellSheet } from "@/components/trade/SellSheet";
import { Button } from "@/components/ui/Button";
import { Change } from "@/components/ui/Change";
import { ProviderPill } from "@/components/ui/ProviderPill";
import { Bar, RowSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { units, usd } from "@/lib/format";
import { useApi } from "@/lib/client/api";
import { useActiveWallet } from "@/lib/client/wallet";
import type { Position } from "@/lib/client/types";

/** Position detail (UI_SPEC §8.5): exact units from the contract, valued at current marks. */
export default function PositionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = useApi();
  const router = useRouter();
  const wallet = useActiveWallet();
  const [sheet, setSheet] = useState<"sell" | "redeem" | null>(null);
  const q = useQuery({ queryKey: ["position", id], queryFn: () => api<Position & { owner: string | null; closed: boolean }>(`/api/positions/${id}`), refetchInterval: 15_000 });
  const p = q.data;
  const mine = !!p?.owner && p.owner.toLowerCase() === wallet?.address.toLowerCase();

  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  return (
    <div className="lg:mx-auto lg:max-w-[760px] lg:pt-8">
      <header className="flex items-center gap-3 px-3 pt-3 lg:px-0 lg:pt-0">
        <button onClick={() => router.back()} aria-label="Back" className="press grid h-11 w-9 place-items-center text-text-muted hover:text-text">
          <ChevronLeft size={26} />
        </button>
        <TokenLogo src={p?.stackImage} label={p?.stackTicker ?? "?"} basket={p?.stackTicker} size={40} />
        <div className="min-w-0">
          <p className="text-[18px] font-bold">Position #{id}</p>
          {p && (
            <Link href={`/app/basket/${p.stackId}`} className="text-secondary text-text-muted hover:text-text">
              ${p.stackTicker} · bought {new Date(p.openedAt * 1000).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
            </Link>
          )}
        </div>
      </header>

      <section className="mt-5 px-gutter lg:px-0">
        {q.isLoading ? (
          <Bar className="h-9 w-40" />
        ) : (
          <>
            <p className="text-detail-price tnum">{usd(p?.valueUsd)}</p>
            <p className="mt-1 flex items-center gap-2 text-change">
              <Change value={p?.pnlPct} amount={p?.pnlUsd} />
              <span className="text-text-muted">vs cost basis {usd(p?.costBasisUsd)}</span>
            </p>
            <p className="mt-2 text-[13px] text-text-muted">Indicative value at current onchain marks, not a quote.</p>
          </>
        )}
      </section>

      <div className="mt-6 px-gutter lg:px-0">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-border pb-2 text-[13px] text-text-muted">
          <span>Stock</span>
          <span className="text-right">Units</span>
          <span className="w-[74px] text-right">Value</span>
        </div>
        {q.isLoading ? (
          <RowSkeleton count={3} />
        ) : p?.closed ? (
          <p className="py-8 text-center text-secondary text-text-muted">This position has been fully sold or redeemed.</p>
        ) : (
          p?.components.map((c) => {
            const share = p.valueUsd && c.valueUsd !== null ? (c.valueUsd / p.valueUsd) * 100 : null;
            return (
              <div key={c.address} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 py-3">
                <Link href={`/app/stock/${c.provider}/${c.address}`} className="flex min-w-0 items-center gap-2">
                  <TokenLogo src={c.logoUrl} label={c.ticker} size={32} />
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold">{c.ticker}</span>
                    <ProviderPill provider={c.provider} />
                  </span>
                </Link>
                <span className="text-right text-[14px] tnum" title={`${c.units} raw units`}>
                  {units(c.unitsDisplay)}
                </span>
                <span className="w-[74px] text-right">
                  <span className="block text-[14px] tnum">{usd(c.valueUsd)}</span>
                  <span className="block text-[12px] text-text-muted tnum">{share !== null ? `${share.toFixed(1)}%` : "—"}</span>
                </span>
              </div>
            );
          })
        )}
      </div>

      {mine && !p?.closed && p && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-app gap-2 bg-gradient-to-t from-bg via-bg to-transparent px-gutter pt-6 lg:static lg:mt-8 lg:max-w-none lg:bg-none lg:px-0 lg:pt-0" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
          <Button variant="secondary" className="flex-1" onClick={() => setSheet("redeem")}>
            Redeem stocks
          </Button>
          <Button className="flex-1" onClick={() => setSheet("sell")}>
            Sell
          </Button>
        </div>
      )}
      {p && sheet && (
        <SellSheet
          open
          onClose={() => {
            setSheet(null);
            void q.refetch();
          }}
          target={{ kind: "stack", ticker: p.stackTicker ?? "", positions: [p], initialPositionId: p.id, initialMode: sheet === "redeem" ? "redeem" : "sell" }}
        />
      )}
    </div>
  );
}

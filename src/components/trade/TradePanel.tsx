"use client";

import { ArrowLeftRight, Wallet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { usd } from "@/lib/format";
import { usePortfolio } from "@/lib/client/queries";
import type { Holding, Position } from "@/lib/client/types";
import { BuyForm, type BuyComponent } from "./BuySheet";
import { IntentSheet } from "./IntentSheet";
import { SellForm } from "./SellSheet";

type BuyTarget = { kind: "stock"; component: BuyComponent } | { kind: "stack"; stackId: number; ticker: string; components: BuyComponent[] };
type SellTarget = { kind: "stock"; holding: Holding } | { kind: "stack"; ticker: string; positions: Position[] };

/**
 * Desktop trade panel (lg and up): the buy and sell forms always open beside the chart instead
 * of behind a sticky CTA and bottom sheet. The progress checklist still opens as a dialog.
 */
export function TradePanel({
  buy,
  sell,
  minBuyUsd,
  disabledReason,
  onDeposit,
  onCompare,
  note,
}: {
  buy: BuyTarget | null;
  sell: SellTarget | null;
  minBuyUsd: number;
  disabledReason?: string | null;
  onDeposit: () => void;
  onCompare?: () => void;
  note?: React.ReactNode;
}) {
  const portfolio = usePortfolio();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [intentId, setIntentId] = useState<string | null>(null);
  const usdt = portfolio.data?.usdt.display ?? null;
  const canSell = !!sell;
  const needsDeposit = usdt !== null && usdt < minBuyUsd;

  return (
    <aside className="sticky top-6 hidden rounded-card border border-border bg-surface p-5 lg:block">
      {canSell && (
        <div role="tablist" className="mb-5 grid grid-cols-2 rounded-chip bg-surface-2 p-1">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={side === s}
              onClick={() => setSide(s)}
              className={cn("h-10 rounded-[10px] text-[15px] font-semibold capitalize transition-colors", side === s ? "bg-surface text-text shadow-[0_1px_0_rgba(255,255,255,0.04)]" : "text-text-muted")}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {side === "sell" && sell ? (
        <SellForm target={sell} onStarted={setIntentId} />
      ) : disabledReason ? (
        <p className="py-8 text-center text-[15px] text-text-muted">{disabledReason}</p>
      ) : !portfolio.data ? (
        <div className="h-40" />
      ) : needsDeposit ? (
        <div className="py-4 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-text-muted">
            <Wallet size={22} />
          </span>
          <p className="mt-4 text-[16px] font-semibold">Add USDT to buy</p>
          <p className="mt-1 text-secondary text-text-muted">
            Minimum buy is ${minBuyUsd}. You have {usd(usdt)}.
          </p>
          <Button className="mt-5 w-full" onClick={onDeposit}>
            Deposit
          </Button>
        </div>
      ) : buy ? (
        <BuyForm target={buy} onDeposit={onDeposit} onStarted={setIntentId} />
      ) : null}

      {(onCompare || note) && (
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
          <div className="min-w-0 text-secondary text-text-muted">{note}</div>
          {onCompare && (
            <Button variant="secondary" size="md" className="h-9 shrink-0 px-3 text-[14px]" onClick={onCompare}>
              <ArrowLeftRight size={16} /> Compare
            </Button>
          )}
        </div>
      )}

      {intentId && <IntentSheet intentId={intentId} open onClose={() => setIntentId(null)} />}
    </aside>
  );
}

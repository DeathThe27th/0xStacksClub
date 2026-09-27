"use client";

import { Button } from "@/components/ui/Button";

/** Sticky full-width CTA, 16px from the sides, above the safe area (UI_SPEC §4.5). */
export function StickyCta({ note, state, onDeposit, onBuy, onSell, disabledReason }: {
  note?: React.ReactNode;
  state: "deposit" | "buy" | "both" | "loading";
  onDeposit: () => void;
  onBuy: () => void;
  onSell: () => void;
  disabledReason?: string | null;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-app bg-gradient-to-t from-bg via-bg to-transparent px-gutter pt-6" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
      {note && <div className="mb-3 flex justify-center">{note}</div>}
      {disabledReason ? (
        <Button className="w-full" disabled>
          {disabledReason}
        </Button>
      ) : state === "loading" ? (
        <Button className="w-full" loading>
          Loading
        </Button>
      ) : state === "deposit" ? (
        <Button className="w-full" onClick={onDeposit}>
          Deposit to buy
        </Button>
      ) : state === "buy" ? (
        <Button className="w-full" onClick={onBuy}>
          Buy
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onSell}>
            Sell
          </Button>
          <Button className="flex-1" onClick={onBuy}>
            Buy
          </Button>
        </div>
      )}
    </div>
  );
}

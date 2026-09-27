"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { cn } from "@/lib/cn";
import { units as fmtUnits, usd } from "@/lib/format";
import { percentToBps } from "@/lib/math";
import { ApiError, useApi } from "@/lib/client/api";
import type { Holding, Intent, Position } from "@/lib/client/types";
import { IntentSheet } from "./IntentSheet";

type Target = { kind: "stock"; holding: Holding } | { kind: "stack"; ticker: string; positions: Position[]; initialPositionId?: number; initialMode?: "sell" | "redeem" };

/** Sell sheet (UI_SPEC §6.3). Estimates are indicative; actual proceeds come from the fills. */
export function SellSheet({ open, onClose, target }: { open: boolean; onClose: () => void; target: Target }) {
  const api = useApi();
  const [pct, setPct] = useState(50);
  const [mode, setMode] = useState<"sell" | "redeem">(target.kind === "stack" ? (target.initialMode ?? "sell") : "sell");
  const [positionId, setPositionId] = useState<number | null>(target.kind === "stack" ? (target.initialPositionId ?? target.positions[0]?.id ?? null) : null);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPct(50);
      setError(null);
    }
  }, [open]);

  const position = target.kind === "stack" ? target.positions.find((p) => p.id === positionId) : undefined;
  const grossValue = target.kind === "stock" ? target.holding.valueUsd : (position?.valueUsd ?? null);
  const est = grossValue !== null ? (grossValue * pct) / 100 : null;
  const fee = mode === "sell" && est !== null ? est * 0.01 : 0;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const bps = percentToBps(pct);
      const body =
        target.kind === "stock"
          ? { kind: "sell_stock", assetAddress: target.holding.address, bps }
          : { kind: mode === "sell" ? "sell_stack" : "redeem", positionId, bps };
      const intent = await api<Intent>("/api/intents", { method: "POST", json: body });
      setIntentId(intent.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start");
    } finally {
      setBusy(false);
    }
  };

  if (intentId) {
    return (
      <IntentSheet
        intentId={intentId}
        open={open}
        onClose={() => {
          setIntentId(null);
          onClose();
        }}
      />
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={target.kind === "stock" ? `Sell ${target.holding.ticker}` : `$${target.ticker}`}>
      {target.kind === "stack" && (
        <>
          <div role="tablist" className="mb-4 grid grid-cols-2 rounded-chip bg-surface-2 p-1">
            {(["sell", "redeem"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn("h-10 rounded-[10px] text-[15px] font-semibold transition-colors", mode === m ? "bg-surface text-text" : "text-text-muted")}
              >
                {m === "sell" ? "Sell for USDT" : "Redeem stocks"}
              </button>
            ))}
          </div>
          {target.positions.length > 1 && (
            <div className="no-scrollbar -mx-gutter mb-4 flex gap-2 overflow-x-auto px-gutter">
              {target.positions.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPositionId(p.id)}
                  className={cn("press shrink-0 rounded-chip border px-3 py-2 text-left", p.id === positionId ? "border-primary bg-primary/10" : "border-border bg-surface-2")}
                >
                  <p className="text-[14px] font-semibold">Position #{p.id}</p>
                  <p className="text-[12px] text-text-muted">{usd(p.valueUsd)}</p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <p className="text-center text-[48px] font-bold leading-none tnum">{pct}%</p>
      <input
        type="range"
        min={1}
        max={100}
        value={pct}
        onChange={(e) => setPct(Number(e.target.value))}
        aria-label="Percentage"
        className="mt-6 w-full accent-primary"
      />
      <div className="mt-4 grid grid-cols-4 gap-2">
        {[25, 50, 75, 100].map((v) => (
          <button key={v} onClick={() => setPct(v)} className={cn("press h-10 rounded-chip text-[15px] font-medium", pct === v ? "bg-primary text-white" : "bg-surface-2")}>
            {v}%
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3 rounded-card bg-surface-2 p-4 text-[15px]">
        {mode === "sell" ? (
          <>
            <div className="flex justify-between">
              <span className="text-text-muted">Estimated USDT received</span>
              <span className="tnum">{est !== null ? `≈ ${usd(est - fee)}` : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Fee (1% of proceeds)</span>
              <span className="tnum">{est !== null ? usd(fee) : "—"}</span>
            </div>
          </>
        ) : (
          <p className="text-text-muted">These exact tokens go straight to your wallet. No fee.</p>
        )}
        {position?.components.map((c) => (
          <div key={c.address} className="flex items-center gap-2">
            <TokenLogo src={c.logoUrl} label={c.ticker} size={20} />
            <span className="flex-1 text-text-muted">{c.ticker}</span>
            <span className="tnum">
              {fmtUnits((Number(c.unitsDisplay) * pct / 100).toString())}
              {c.valueUsd !== null && <span className="ml-1.5 text-text-muted">{usd((c.valueUsd * pct) / 100)}</span>}
            </span>
          </div>
        ))}
        {target.kind === "stock" && (
          <div className="flex justify-between">
            <span className="text-text-muted">Selling</span>
            <span className="tnum">
              {fmtUnits((Number(target.holding.unitsDisplay) * pct / 100).toString())} {target.holding.symbol}
            </span>
          </div>
        )}
      </div>
      {mode === "sell" && target.kind === "stack" && (
        <p className="mt-3 text-secondary text-text-muted">The position is reduced first, then each stock is sold in turn. If a sale fails, the unsold tokens stay in your wallet.</p>
      )}
      {error && <p className="mt-3 text-center text-secondary text-down">{error}</p>}
      <Button className="mt-5 w-full" loading={busy} disabled={target.kind === "stack" && !position} onClick={confirm}>
        {mode === "sell" ? `Sell ${pct}%` : `Redeem ${pct}%`}
      </Button>
    </Sheet>
  );
}

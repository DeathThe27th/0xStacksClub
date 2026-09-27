"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { cn } from "@/lib/cn";
import { MIN_BUY_USD_LARGE, MIN_BUY_USD_SMALL, USDT_ADDRESS } from "@/lib/constants";
import { usd } from "@/lib/format";
import { allocate, buyFee } from "@/lib/math";
import { ApiError, useApi } from "@/lib/client/api";
import { usePortfolio, useUsdtDecimals } from "@/lib/client/queries";
import { gasNeededWei } from "@/lib/client/runner";
import type { Intent } from "@/lib/client/types";
import { IntentSheet } from "./IntentSheet";

export type BuyComponent = { address: string; ticker: string; provider: string; logoUrl: string | null; price: number | null; decimals: number; weightBps: number };

type Target = { kind: "stock"; component: BuyComponent } | { kind: "stack"; stackId: number; ticker: string; components: BuyComponent[] };

type Preview = { expectedOut: string; minOut: string; mode: string; expiresAt: number };

/** Buy sheet (UI_SPEC §6.2): the buy form in a sheet, then the progress checklist. */
export function BuySheet({ open, onClose, target, onDeposit }: { open: boolean; onClose: () => void; target: Target; onDeposit: () => void }) {
  const [intentId, setIntentId] = useState<string | null>(null);
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
  const title = target.kind === "stock" ? `Buy ${target.component.ticker}` : `Buy $${target.ticker}`;
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <BuyForm target={target} onDeposit={onDeposit} onStarted={setIntentId} active={open} />
    </Sheet>
  );
}

/**
 * Amount, breakdown, review with fresh quotes (UI_SPEC §6.2). Used in the mobile sheet and inline in
 * the desktop trade panel. Calls onStarted with the new intent; the caller shows the checklist.
 */
export function BuyForm({ target, onDeposit, onStarted, active = true }: { target: Target; onDeposit: () => void; onStarted: (intentId: string) => void; active?: boolean }) {
  const api = useApi();
  const portfolio = usePortfolio();
  const dec = useUsdtDecimals();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"amount" | "review">("amount");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const components = target.kind === "stock" ? [target.component] : target.components;
  const isStack = target.kind === "stack";
  const minUsd = isStack && components.length >= 4 ? MIN_BUY_USD_LARGE : MIN_BUY_USD_SMALL;
  const decimals = dec.data;

  useEffect(() => {
    if (!active) {
      setStep("amount");
      setAmount("");
      setError(null);
    }
  }, [active]);
  useEffect(() => {
    if (step !== "review") return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [step]);

  const gross = useMemo(() => {
    if (decimals === undefined || !amount) return 0n;
    try {
      return parseUnits(amount, decimals);
    } catch {
      return 0n;
    }
  }, [amount, decimals]);
  const { fee, net } = buyFee(gross, isStack);
  const alloc = gross > 0n ? allocate(net, components.map((c) => c.weightBps)) : components.map(() => 0n);

  const gas = useQuery({
    queryKey: ["gas", isStack ? "buy_stack" : "buy_stock", components.length],
    queryFn: () => gasNeededWei(isStack ? "buy_stack" : "buy_stock", components.length),
    enabled: active,
    staleTime: 60_000,
  });

  const usdtBal = portfolio.data ? BigInt(portfolio.data.usdt.raw) : null;
  const bnbBal = portfolio.data ? BigInt(portfolio.data.bnb.raw) : null;
  const minRaw = decimals !== undefined ? parseUnits(String(minUsd), decimals) : 0n;
  const validation =
    gross === 0n
      ? null
      : gross < minRaw
        ? `Minimum buy is $${minUsd}`
        : usdtBal !== null && gross > usdtBal
          ? "Not enough USDT"
          : bnbBal !== null && gas.data && bnbBal < gas.data
            ? `You need about ${Number(formatUnits(gas.data, 18)).toFixed(4)} BNB for network fees`
            : null;

  const previews = useQuery({
    queryKey: ["preview", components.map((c) => c.address).join(","), gross.toString()],
    queryFn: async () => {
      const out: (Preview | { error: string })[] = [];
      for (let i = 0; i < components.length; i++) {
        try {
          out.push(await api<Preview>("/api/quote", { method: "POST", json: { from: USDT_ADDRESS, to: components[i]!.address, amount: alloc[i]!.toString() } }));
        } catch (e) {
          out.push({ error: (e as Error).message });
        }
      }
      return out;
    },
    enabled: step === "review" && gross > 0n,
    refetchInterval: 25_000,
    staleTime: 0,
  });

  const quoteAge = previews.dataUpdatedAt ? Math.max(0, 30 - Math.floor((now - previews.dataUpdatedAt) / 1000)) : null;
  const previewError = previews.data?.find((p): p is { error: string } => "error" in p);

  const confirm = async () => {
    setCreating(true);
    setError(null);
    try {
      const intent = await api<Intent>("/api/intents", {
        method: "POST",
        json: target.kind === "stock" ? { kind: "buy_stock", assetAddress: target.component.address, grossAmount: gross.toString() } : { kind: "buy_stack", stackId: target.stackId, grossAmount: gross.toString() },
      });
      setStep("amount");
      setAmount("");
      onStarted(intent.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start the buy");
    } finally {
      setCreating(false);
    }
  };

  const setMax = () => {
    if (usdtBal === null || decimals === undefined) return;
    setAmount(formatUnits(usdtBal, decimals).replace(/(\.\d{2})\d+$/, "$1"));
  };

  return (
    <div>
      {step === "amount" ? (
        <>
          <label className="flex items-baseline justify-center gap-1 py-4">
            <span className={cn("text-[48px] font-bold leading-none", amount ? "text-text" : "text-text-dim")}>$</span>
            <input
              autoFocus
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, "");
                if (/^\d*\.?\d{0,2}$/.test(v)) setAmount(v);
              }}
              placeholder="0"
              aria-label="Amount in USD"
              className="w-[6ch] min-w-[2ch] bg-transparent text-[48px] font-bold leading-none tnum outline-none placeholder:text-text-dim"
              style={{ width: `${Math.max(1, amount.length || 1) + 0.5}ch` }}
            />
          </label>
          <div className="flex justify-center gap-2">
            {["10", "25", "50"].map((v) => (
              <button key={v} onClick={() => setAmount(v)} className="press h-9 rounded-chip bg-surface-2 px-4 text-[15px] font-medium">
                ${v}
              </button>
            ))}
            <button onClick={setMax} className="press h-9 rounded-chip bg-surface-2 px-4 text-[15px] font-medium">
              Max
            </button>
          </div>
          <p className="mt-3 text-center text-secondary text-text-muted">
            Balance: {portfolio.data ? `${portfolio.data.usdt.display.toFixed(2)} USDT` : "…"}
          </p>

          <div className="mt-5 space-y-3 rounded-card bg-surface-2 p-4 text-[15px]">
            <Row label="Fee (1%)" value={decimals !== undefined ? usd(Number(formatUnits(fee, decimals))) : "—"} />
            <Row label="Amount invested" value={decimals !== undefined ? usd(Number(formatUnits(net, decimals))) : "—"} />
            {components.map((c, i) => {
              const dollars = decimals !== undefined ? Number(formatUnits(alloc[i]!, decimals)) : 0;
              return (
                <div key={c.address} className="flex items-center gap-2">
                  <TokenLogo src={c.logoUrl} label={c.ticker} size={20} />
                  <span className="flex-1 text-text-muted">
                    {c.ticker}
                    {isStack && <span className="ml-1 text-text-dim">{(c.weightBps / 100).toFixed(2)}%</span>}
                  </span>
                  <span className="tnum">
                    {usd(dollars)}
                    {c.price ? <span className="ml-1.5 text-text-muted">≈ {(dollars / c.price).toFixed(4)}</span> : null}
                  </span>
                </div>
              );
            })}
            <Row label="Estimated gas" value={gas.data ? `${Number(formatUnits(gas.data, 18)).toFixed(5)} BNB` : "…"} />
          </div>
          {validation && (
            <p className="mt-3 text-center text-secondary text-down" role="alert">
              {validation}
            </p>
          )}
          <div className="mt-5">
            {validation === "Not enough USDT" || (validation?.startsWith("You need") ?? false) ? (
              <Button className="w-full" onClick={onDeposit}>
                Deposit
              </Button>
            ) : (
              <Button className="w-full" disabled={!!validation || gross === 0n} onClick={() => setStep("review")}>
                Review
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between text-secondary">
            <span className="font-semibold text-text">Review · fresh quotes</span>
            <span className={cn("tnum", quoteAge !== null && quoteAge < 8 ? "text-warn" : "text-text-muted")}>
              {previews.isFetching ? "Refreshing…" : quoteAge !== null ? `Refreshes in ${quoteAge}s` : ""}
            </span>
          </div>
          <div className="space-y-3 rounded-card bg-surface-2 p-4">
            {components.map((c, i) => {
              const p = previews.data?.[i];
              return (
                <div key={c.address} className="flex items-center gap-3">
                  <TokenLogo src={c.logoUrl} label={c.ticker} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">
                      {c.ticker} <span className="font-normal text-text-muted">{decimals !== undefined ? usd(Number(formatUnits(alloc[i]!, decimals))) : ""}</span>
                    </p>
                    {p && "error" in p ? (
                      <p className="text-secondary text-down">{p.error}</p>
                    ) : p ? (
                      <p className="text-secondary text-text-muted">
                        Min received {Number(formatUnits(BigInt(p.minOut), c.decimals)).toFixed(6)} · {p.mode}
                      </p>
                    ) : (
                      <p className="text-secondary text-text-muted">Getting quote…</p>
                    )}
                  </div>
                  <span className="text-[15px] tnum">{p && !("error" in p) ? Number(formatUnits(BigInt(p.expectedOut), c.decimals)).toFixed(6) : ""}</span>
                </div>
              );
            })}
          </div>
          {isStack && (
            <p className="mt-4 text-secondary text-text-muted">
              Each stock is bought in turn, then deposited into your own position. If one step fails you can retry it or keep what was bought.
            </p>
          )}
          {error && <p className="mt-3 text-center text-secondary text-down">{error}</p>}
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setStep("amount")}>
              Back
            </Button>
            <Button className="flex-[2]" loading={creating} disabled={!previews.data || !!previewError} onClick={confirm}>
              Confirm buy {decimals !== undefined ? usd(Number(formatUnits(gross, decimals))) : ""}
            </Button>
          </div>
          {previewError && <p className="mt-3 text-center text-[13px] text-text-muted">Can&apos;t buy right now: {previewError.error}</p>}
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-muted">{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}


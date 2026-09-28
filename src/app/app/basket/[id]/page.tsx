"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { ChartControls, PriceChart, type Point, type Timeframe } from "@/components/chart/PriceChart";
import { ClubSection } from "@/components/club/ClubSection";
import { StickyCta } from "@/components/detail/Cta";
import { TradePanel } from "@/components/trade/TradePanel";
import { OverlayToggle, StatsStrip, TradesFeed, useTrades } from "@/components/detail/Trades";
import { PositionCard } from "@/components/trade/PositionCard";
import { FeedTab } from "@/components/detail/Feed";
import { HoldersTab } from "@/components/detail/Holders";
import { SharePrompt } from "@/components/detail/SharePrompt";
import { DetailTopBar } from "@/components/detail/TopBar";
import { TradesSheet } from "@/components/detail/TradesSheet";
import { BuySheet } from "@/components/trade/BuySheet";
import { DepositSheet } from "@/components/trade/DepositSheet";
import { SellSheet } from "@/components/trade/SellSheet";
import { Change } from "@/components/ui/Change";
import { ProviderPill } from "@/components/ui/ProviderPill";
import { Bar } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { MIN_BUY_USD_LARGE, MIN_BUY_USD_SMALL } from "@/lib/constants";
import { vaultAddr } from "@/lib/client/runner";
import { pct, shortAddress, usd } from "@/lib/format";
import { INDEX_BASE } from "@/lib/math";
import { useApi } from "@/lib/client/api";
import { usePortfolio, useWatch } from "@/lib/client/queries";
import type { AssetItem, StackSummary } from "@/lib/client/types";

type Component = AssetItem & { weightBps: number; valueWeightPct: number | null };
type Detail = { stack: StackSummary; components: Component[] };

export default function BasketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = useApi();
  const [tf, setTf] = useState<Timeframe>("1D");
  const [scrub, setScrub] = useState<Point | null>(null);
  const [right, setRight] = useState<0 | 1 | 2>(0);
  const [tab, setTab] = useState<"holders" | "composition" | "trades" | "feed" | "about">("holders");
  const trades = useTrades("stack", id);
  const [sheet, setSheet] = useState<"buy" | "sell" | "deposit" | "history" | null>(null);
  const watch = useWatch("stack", id);
  const portfolio = usePortfolio();

  const q = useQuery({ queryKey: ["stack", id], queryFn: () => api<Detail>(`/api/stacks/${id}`), refetchInterval: 15_000 });
  const series = useQuery({
    queryKey: ["stack-index", id, tf],
    queryFn: () => api<{ points: { t: number; value: number; reference: number | null }[] }>(`/api/stacks/${id}/index?tf=${tf}`),
    refetchInterval: tf === "LIVE" ? 5000 : undefined,
  });
  const s = q.data?.stack;
  const points: Point[] = useMemo(() => series.data?.points ?? [], [series.data]);
  // The series is an index (what $1,000 at launch is worth now). It only drives the chart and the
  // percent moves; the headline number is the real USD value held in the basket.
  const current = scrub?.value ?? s?.index ?? points.at(-1)?.value ?? null;
  const first = points[0]?.value;
  const change = first && current !== null ? current - first : null;
  const changePct = first && change !== null ? (change / first) * 100 : null;
  const up = (changePct ?? 0) >= 0;

  const positions = (portfolio.data?.positions ?? []).filter((p) => String(p.stackId) === id);
  const min = (s?.components.length ?? 0) >= 4 ? MIN_BUY_USD_LARGE : MIN_BUY_USD_SMALL;
  const usdt = portfolio.data?.usdt.display ?? null;
  const ctaState = !portfolio.data ? "loading" : usdt !== null && usdt < min && !positions.length ? "deposit" : positions.length ? "both" : usdt !== null && usdt < min ? "deposit" : "buy";
  const notTradable = q.data?.components.find((c) => !c.can_trade);

  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const creator = s?.creator?.username;
  const rightBlock = s
    ? [
        { label: "Holders", value: String(s.holders) },
        { label: "Creator earned", value: usd(Number(BigInt(s.creatorEarnedRaw)) / 1e18) },
        { label: "Since launch", value: s.change !== null ? `${s.change >= 0 ? "+" : "-"}${pct(s.change)}` : "—" },
      ][right]!
    : null;

  return (
    <div>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6 lg:pt-5">
        <div className="min-w-0">
      <DetailTopBar
        logo={s?.image_url ?? null}
        title={s ? `$${s.ticker}` : "…"}
        subtitle={s?.name ?? "…"}
        subtitleNode={
          s && (
            <p className="truncate text-secondary text-text-muted">
              {s.name} ·{" "}
              {creator ? (
                <Link href={`/app/u/${creator}`} className="text-text hover:underline">
                  by @{creator}
                </Link>
              ) : (
                `by ${shortAddress(s.creator_address)}`
              )}
            </p>
          )
        }
        watched={watch.watched}
        onWatch={watch.toggle}
        onHistory={() => setSheet("history")}
      />

      <StatsStrip
        items={[
          { label: "Value held", value: usd(s?.valueHeldUsd) },
          { label: "Since launch", value: <Change value={s?.change} /> },
          { label: "24h", value: <Change value={s?.change24h} /> },
          { label: "7d", value: <Change value={s?.change7d} /> },
          { label: "Holders", value: s?.holders ?? "—" },
          { label: "Creator earned", value: s ? usd(Number(BigInt(s.creatorEarnedRaw)) / 1e18) : "—" },
          { label: `${s?.components.length ?? ""} stocks`.trim(), value: s?.components.map((c) => c.ticker).join(" · ") ?? "—" },
        ]}
      />

      <section className="mt-4 flex items-start justify-between gap-4 px-gutter lg:mt-6 lg:px-0">
        <div className="min-w-0">
          {q.isLoading ? (
            <Bar className="h-9 w-40" />
          ) : (
            <p className="text-detail-price tnum" title="USD value of every open position in this basket">
              {usd(s?.valueHeldUsd)}
              <span className="ml-2 text-[15px] font-normal text-text-muted">held</span>
            </p>
          )}
          <p className="mt-1 flex items-center gap-2">
            <Change value={changePct} />
            <span className="text-change text-text-muted">{scrub ? new Date(scrub.t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : tf === "ALL" ? "All" : tf === "1W" ? "7d" : tf === "1D" ? "24h" : "1h"}</span>
          </p>
        </div>
        {rightBlock && (
          <button onClick={() => setRight(((right + 1) % 3) as 0 | 1 | 2)} className="press shrink-0 text-right lg:hidden" aria-label={`Showing ${rightBlock.label}. Tap to switch.`}>
            <p className="flex items-center justify-end gap-1 text-[20px] font-semibold tnum">
              <ChevronsUpDown size={16} className="text-text-muted" />
              {rightBlock.value}
            </p>
            <p className="text-secondary text-text-muted">{rightBlock.label}</p>
          </button>
        )}
      </section>

      <div className="mt-4">
        {series.isLoading ? (
          <Bar className="mx-gutter h-[320px] lg:mx-0 lg:h-[420px]" />
        ) : series.isError ? (
          <ErrorState message="Index data isn't available right now." onRetry={() => series.refetch()} />
        ) : points.length > 1 ? (
          <PriceChart points={points} mode="area" up={up} onScrub={setScrub} formatPrice={(n) => `${n >= INDEX_BASE ? "+" : "-"}${pct((n / INDEX_BASE - 1) * 100)}`} showReference={points.some((p) => p.reference != null)} markers={trades.markers} />
        ) : (
          <div className="grid h-[320px] place-items-center px-8 text-center text-secondary text-text-muted">The index chart fills in as points are recorded every 5 minutes.</div>
        )}
        <div className="flex flex-wrap items-center justify-between">
          <OverlayToggle value={trades.overlay} onChange={trades.setOverlay} />
          <ChartControls value={tf} onChange={setTf} />
        </div>
      </div>

      <ClubSection stackId={id} ticker={s?.ticker} />

      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
      <div className="px-gutter lg:px-0">
        <Tabs
          tabs={[
            { id: "holders", label: `Holders (${s?.holders ?? 0})` },
            { id: "composition", label: "Composition" },
            { id: "trades", label: "Trades" },
            { id: "feed", label: "Feed" },
            { id: "about", label: "About" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "holders" && <HoldersTab targetType="stack" targetId={id} />}
        {tab === "feed" && <FeedTab targetType="stack" targetId={id} />}
        {tab === "trades" && <TradesFeed trades={trades.trades} loading={trades.loading} className="pt-3" />}
        {tab === "composition" && (
          <ul className="space-y-4 py-5">
            {q.data?.components.map((c) => (
              <li key={c.address}>
                <Link href={`/app/stock/${c.provider}/${c.address}`} className="press flex items-center gap-3">
                  <TokenLogo src={c.logo_url} label={c.ticker} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[17px] font-semibold">
                      {c.ticker} <ProviderPill provider={c.provider} />
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${c.weightBps / 100}%` }} />
                      </span>
                      <span className="w-[52px] text-right text-[13px] font-medium tnum">{(c.weightBps / 100).toFixed(2)}%</span>
                      <span className="w-[52px] text-right text-[13px] text-text-muted tnum" title="Current value weight">
                        {c.valueWeightPct != null ? `${c.valueWeightPct.toFixed(1)}%` : "—"}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
            <li className="text-[13px] text-text-muted">Recipe weight, then current value weight. They drift apart because nothing is rebalanced.</li>
          </ul>
        )}
        {tab === "about" && s && (
          <div className="space-y-4 py-5 text-[15px]">
            {s.description && <p className="whitespace-pre-wrap">{s.description}</p>}
            <dl className="space-y-3">
              <Row label="Creator">{creator ? `@${creator}` : shortAddress(s.creator_address)}</Row>
              <Row label="Created">{new Date(s.created_at).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })}</Row>
              <Row label="Recipe tx">
                <a href={`https://bscscan.com/tx/${s.tx_hash}`} target="_blank" rel="noreferrer" className="text-link">
                  {shortAddress(s.tx_hash)}
                </a>
              </Row>
              <Row label="Contract">
                <a href={`https://bscscan.com/address/${safeVault()}`} target="_blank" rel="noreferrer" className="text-link">
                  {shortAddress(safeVault())}
                </a>
              </Row>
            </dl>
            <p className="text-secondary text-text-muted">Value held is the live USD value of every open position in this basket. The chart and percent moves track what $1,000 put in at launch would be worth now, without rebalancing.</p>
            <p className="text-secondary text-text-muted">Buying creates your own position with the exact tokens bought. Weights are not rebalanced.</p>
          </div>
        )}
      </div>
      <section className="hidden rounded-card border border-border bg-surface p-4 lg:block">
        <h3 className="text-[15px] font-semibold">Live trades</h3>
        <TradesFeed trades={trades.trades} loading={trades.loading} className="mt-1 max-h-[460px] overflow-y-auto" />
      </section>
      </div>

        </div>
        <div className="lg:sticky lg:top-20">
        <TradePanel
          buy={
            q.data
              ? {
                  kind: "stack",
                  stackId: Number(id),
                  ticker: q.data.stack.ticker,
                  components: q.data.components.map((c) => ({
                    address: c.address,
                    ticker: c.ticker,
                    provider: c.provider,
                    logoUrl: c.logo_url,
                    price: c.price?.price_usd ? Number(c.price.price_usd) : null,
                    decimals: c.decimals,
                    weightBps: c.weightBps,
                  })),
                }
              : null
          }
          sell={s && positions.length ? { kind: "stack", ticker: s.ticker, positions } : null}
          minBuyUsd={min}
          disabledReason={notTradable ? `${notTradable.ticker} isn't tradable right now` : null}
          onDeposit={() => setSheet("deposit")}
          note={s && <>Created by {creator ? `@${creator}` : shortAddress(s.creator_address)} · 0.25% creator fee</>}
        />
        <PositionCard positions={positions} />
        </div>
      </div>

      <StickyCta
        note={s && <span className="text-secondary text-text-muted">Created by {creator ? `@${creator}` : shortAddress(s.creator_address)} · 0.25% creator fee</span>}
        state={ctaState}
        disabledReason={notTradable ? `${notTradable.ticker} isn't tradable right now` : null}
        minBuyUsd={min}
        onDeposit={() => setSheet("deposit")}
        onBuy={() => setSheet("buy")}
        onSell={() => setSheet("sell")}
      />

      {q.data && sheet === "buy" && (
        <BuySheet
          open
          onClose={() => setSheet(null)}
          onDeposit={() => setSheet("deposit")}
          target={{
            kind: "stack",
            stackId: Number(id),
            ticker: q.data.stack.ticker,
            components: q.data.components.map((c) => ({
              address: c.address,
              ticker: c.ticker,
              provider: c.provider,
              logoUrl: c.logo_url,
              price: c.price?.price_usd ? Number(c.price.price_usd) : null,
              decimals: c.decimals,
              weightBps: c.weightBps,
            })),
          }}
        />
      )}
      {s && sheet === "sell" && <SellSheet open onClose={() => setSheet(null)} target={{ kind: "stack", ticker: s.ticker, positions }} />}
      <DepositSheet open={sheet === "deposit"} onClose={() => setSheet(null)} />
      <TradesSheet open={sheet === "history"} onClose={() => setSheet(null)} targetType="stack" targetId={id} />
      {s && <SharePrompt name={s.name} ticker={s.ticker} />}
    </div>
  );
}

function safeVault() {
  try {
    return vaultAddr();
  } catch {
    return "0x0000000000000000000000000000000000000000";
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right tnum">{children}</dd>
    </div>
  );
}

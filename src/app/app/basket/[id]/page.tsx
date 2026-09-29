"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { PriceChart, type Point } from "@/components/chart/PriceChart";
import { StickyCta } from "@/components/detail/Cta";
import { FeedTab } from "@/components/detail/Feed";
import { HoldersTab } from "@/components/detail/Holders";
import { NewsFeed } from "@/components/detail/News";
import { SharePrompt } from "@/components/detail/SharePrompt";
import { DetailTopBar } from "@/components/detail/TopBar";
import { StatsStrip, TradesFeed, useTrades } from "@/components/detail/Trades";
import { TradesSheet } from "@/components/detail/TradesSheet";
import { BuySheet, type BuyComponent } from "@/components/trade/BuySheet";
import { DepositSheet } from "@/components/trade/DepositSheet";
import { PositionCard } from "@/components/trade/PositionCard";
import { SellSheet } from "@/components/trade/SellSheet";
import { TradePanel } from "@/components/trade/TradePanel";
import { Change, Triangle } from "@/components/ui/Change";
import { Bar } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { basketCategory } from "@/lib/baskets";
import { cn } from "@/lib/cn";
import { MIN_BUY_USD_LARGE, MIN_BUY_USD_SMALL } from "@/lib/constants";
import { compact, pct, price as fmtPrice, shortAddress, usd } from "@/lib/format";
import { useApi } from "@/lib/client/api";
import { usePortfolio, useWatch } from "@/lib/client/queries";
import { vaultAddr } from "@/lib/client/runner";
import type { AssetItem, StackSummary } from "@/lib/client/types";

type Component = AssetItem & { weightBps: number; valueWeightPct: number | null };
type Detail = { stack: StackSummary; components: Component[] };

/**
 * Basket detail. A basket has no price of its own, so there's no basket chart: the page leads with
 * what's inside it (each stock with its own chart on tap), then news across those stocks and their
 * sector, then the club and social tabs. Opens inside the market layout, like a stock.
 */
export default function BasketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = useApi();
  const [tab, setTab] = useState<"trades" | "feed" | "about">("trades");
  const trades = useTrades("stack", id);
  const [sheet, setSheet] = useState<"buy" | "sell" | "deposit" | "history" | null>(null);
  const watch = useWatch("stack", id);
  const portfolio = usePortfolio();

  const q = useQuery({ queryKey: ["stack", id], queryFn: () => api<Detail>(`/api/stacks/${id}`), refetchInterval: 15_000 });
  const s = q.data?.stack;
  const components = useMemo(() => q.data?.components ?? [], [q.data]);
  const category = basketCategory(s?.ticker);

  const positions = (portfolio.data?.positions ?? []).filter((p) => String(p.stackId) === id);
  const min = (s?.components.length ?? 0) >= 4 ? MIN_BUY_USD_LARGE : MIN_BUY_USD_SMALL;
  const usdt = portfolio.data?.usdt.display ?? null;
  const ctaState = !portfolio.data ? "loading" : positions.length ? "both" : usdt !== null && usdt < min ? "deposit" : "buy";
  const notTradable = components.find((c) => !c.can_trade);
  const buyTarget = useMemo(
    () =>
      q.data
        ? {
            kind: "stack" as const,
            stackId: Number(id),
            ticker: q.data.stack.ticker,
            components: q.data.components.map(
              (c): BuyComponent => ({
                address: c.address,
                ticker: c.ticker,
                provider: c.provider,
                logoUrl: c.logo_url,
                price: c.price?.price_usd ? Number(c.price.price_usd) : null,
                decimals: c.decimals,
                weightBps: c.weightBps,
              }),
            ),
          }
        : null,
    [q.data, id],
  );

  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const creator = s?.creator?.username;
  const creatorEarned = s ? usd(Number(BigInt(s.creatorEarnedRaw)) / 1e18) : "—";
  const byLine = s && (creator ? `@${creator}` : shortAddress(s.creator_address));

  return (
    <div>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6 lg:pt-5">
        <div className="min-w-0">
          <DetailTopBar
            logo={s?.image_url ?? null}
            basket={s?.ticker}
            title={s?.name ?? "…"}
            subtitle={s ? `$${s.ticker}` : "…"}
            subtitleNode={
              s && (
                <p className="truncate text-secondary text-text-muted">
                  ${s.ticker} ·{" "}
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
              { label: "24h", value: <Change value={s?.change24h} /> },
              { label: "7d", value: <Change value={s?.change7d} /> },
              { label: "Since launch", value: <Change value={s?.change} /> },
              { label: "Holders", value: s?.holders ?? "—" },
              { label: "Invested", value: usd(s?.valueHeldUsd, { compact: (s?.valueHeldUsd ?? 0) >= 10_000 }) },
              { label: "Creator earned", value: creatorEarned },
            ]}
          />

          {/* Hero: the basket's move today and its thesis. No price: a basket is a recipe, not a token. */}
          <section className="mt-5 px-gutter lg:mt-6 lg:px-0">
            {q.isLoading ? (
              <Bar className="h-9 w-40" />
            ) : (
              <p className="flex items-baseline gap-2">
                <BigChange value={s?.change24h ?? null} />
                <span className="text-[15px] text-text-muted">{s?.change24h != null ? "today" : "No 24h move yet"}</span>
              </p>
            )}
            <p className="mt-1 text-[13px] text-text-muted">
              {category.label}
              {components.length ? ` · ${components.length} stocks` : ""}
              {s?.holders ? ` · ${s.holders} ${s.holders === 1 ? "holder" : "holders"}` : ""}
            </p>
            {s?.description && <Thesis text={s.description} />}
          </section>

          <Composition components={components} loading={q.isLoading} />

          <section className="mt-10 px-gutter lg:px-0">
            <h2 className="text-section">Holders</h2>
            <HoldersTab targetType="stack" targetId={id} />
          </section>

          <div className="mt-10 space-y-10">
            {s && (
              <NewsFeed
                title="News across the basket"
                path={`/api/news?tickers=${components.map((c) => c.ticker).join(",")}`}
                emptyBody="Headlines about these stocks will show here."
                tagged
                limit={6}
              />
            )}
            {s && category.id !== "community" && (
              <NewsFeed
                title={`${category.label} news`}
                subtitle={(d) => (d.matched === false ? "Few sector stories today, so here are the top market headlines" : null)}
                path={`/api/news?sector=${category.id}`}
                limit={4}
              />
            )}
          </div>

          <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
            <div className="px-gutter lg:px-0">
              <Tabs
                tabs={[
                  { id: "trades", label: "Trades" },
                  { id: "feed", label: "Feed" },
                  { id: "about", label: "About" },
                ]}
                value={tab}
                onChange={setTab}
              />
              {tab === "feed" && <FeedTab targetType="stack" targetId={id} />}
              {tab === "trades" && <TradesFeed trades={trades.trades} loading={trades.loading} className="pt-3" />}
              {tab === "about" && s && (
                <div className="space-y-4 py-5 text-[15px]">
                  <dl className="space-y-3">
                    <Row label="Creator">{byLine}</Row>
                    <Row label="Created">{new Date(s.created_at).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })}</Row>
                    <Row label="Invested">{usd(s.valueHeldUsd)}</Row>
                    <Row label="Creator earned">{creatorEarned}</Row>
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
                  <p className="text-secondary text-text-muted">
                    Invested is the live value of every open position in this basket. Buying gives you your own position with the exact tokens bought, split by the recipe weights. Nothing is rebalanced
                    afterwards, so the weights drift as prices move.
                  </p>
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
            buy={buyTarget}
            sell={s && positions.length ? { kind: "stack", ticker: s.ticker, positions } : null}
            minBuyUsd={min}
            disabledReason={notTradable ? `${notTradable.ticker} isn't tradable right now` : null}
            onDeposit={() => setSheet("deposit")}
            note={s && <>Created by {byLine} · 0.25% creator fee</>}
          />
          <PositionCard positions={positions} />
        </div>
      </div>

      <StickyCta
        note={s && <span className="text-secondary text-text-muted">Created by {byLine} · 0.25% creator fee</span>}
        state={ctaState}
        disabledReason={notTradable ? `${notTradable.ticker} isn't tradable right now` : null}
        minBuyUsd={min}
        onDeposit={() => setSheet("deposit")}
        onBuy={() => setSheet("buy")}
        onSell={() => setSheet("sell")}
      />

      {buyTarget && sheet === "buy" && <BuySheet open onClose={() => setSheet(null)} onDeposit={() => setSheet("deposit")} target={buyTarget} />}
      {s && sheet === "sell" && <SellSheet open onClose={() => setSheet(null)} target={{ kind: "stack", ticker: s.ticker, positions }} />}
      <DepositSheet open={sheet === "deposit"} onClose={() => setSheet(null)} />
      <TradesSheet open={sheet === "history"} onClose={() => setSheet(null)} targetType="stack" targetId={id} />
      {s && <SharePrompt name={s.name} ticker={s.ticker} />}
    </div>
  );
}

/** One quiet row per stock, weight first. Tapping a row opens that stock's chart. */
function Composition({ components, loading }: { components: Component[]; loading: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="mt-10 px-gutter lg:px-0">
      <h2 className="text-section">Inside</h2>
      {loading ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <Bar key={i} className="h-14 w-full rounded-card" />
          ))}
        </div>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-border/60">
            {components.map((c) => (
              <ComponentRow key={c.address} c={c} open={open === c.address} onToggle={() => setOpen(open === c.address ? null : c.address)} />
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-text-muted">Each buy splits your money by these weights. Nothing is rebalanced after.</p>
        </>
      )}
    </section>
  );
}

/** The creator's thesis, clamped to three lines until tapped. */
function Thesis({ text }: { text: string }) {
  const [more, setMore] = useState(false);
  const long = text.length > 180;
  return (
    <p className="mt-4 max-w-[62ch] whitespace-pre-wrap text-[15px] leading-relaxed text-text/90">
      <span className={cn(long && !more && "line-clamp-3")}>{text}</span>
      {long && (
        <button onClick={() => setMore(!more)} className="press mt-1 block text-[14px] font-semibold text-text-muted hover:text-text">
          {more ? "Less" : "More"}
        </button>
      )}
    </p>
  );
}

const chartTf = { "1D": "5m", "1W": "1H", ALL: "1D" } as const;
type ChartTf = keyof typeof chartTf;

function ComponentRow({ c, open, onToggle }: { c: Component; open: boolean; onToggle: () => void }) {
  const price = c.price?.price_usd ? Number(c.price.price_usd) : null;
  const ch = c.price?.change_24h != null ? Number(c.price.change_24h) : null;
  const cap = c.price?.market_cap != null ? Number(c.price.market_cap) : null;
  return (
    <li>
      <button onClick={onToggle} aria-expanded={open} className="press flex w-full items-center gap-3 py-3 text-left">
        <span className="w-10 shrink-0 text-[15px] font-semibold tnum text-text-muted">{(c.weightBps / 100).toFixed(0)}%</span>
        <TokenLogo src={c.logo_url} label={c.ticker} size={32} />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold">{c.ticker}</p>
          <p className="truncate text-[13px] text-text-muted">{c.name}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[15px] font-medium tnum">{fmtPrice(price)}</p>
          <Change value={ch} className="justify-end" />
        </div>
      </button>
      {open && <ComponentChart c={c} cap={cap} />}
    </li>
  );
}

type Candle = { t: number; o: number; h: number; l: number; c: number };

function ComponentChart({ c, cap }: { c: Component; cap: number | null }) {
  const api = useApi();
  const [tf, setTf] = useState<ChartTf>("1D");
  const [scrub, setScrub] = useState<Point | null>(null);
  const candles = useQuery({
    queryKey: ["candles", c.address, tf],
    queryFn: () => api<{ candles: Candle[] }>(`/api/market/candles?address=${c.address}&bar=${chartTf[tf]}`),
  });
  const points: Point[] = useMemo(() => (candles.data?.candles ?? []).map((k) => ({ t: k.t, value: k.c, o: k.o, h: k.h, l: k.l, c: k.c })), [candles.data]);
  const first = points[0]?.o ?? points[0]?.value;
  const last = points.at(-1)?.value;
  const shown = scrub?.value ?? last;
  const movePct = first && shown ? ((shown - first) / first) * 100 : null;
  return (
    <div className="pb-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[13px]">
          <span className="font-semibold tnum">{fmtPrice(shown ?? null)}</span>
          <Change value={movePct} />
          <span className="text-text-muted">{scrub ? new Date(scrub.t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : tf === "ALL" ? "All" : tf === "1W" ? "7d" : "24h"}</span>
        </p>
        <div className="flex gap-1">
          {(Object.keys(chartTf) as ChartTf[]).map((t) => (
            <button key={t} onClick={() => setTf(t)} className={cn("press h-7 rounded-chip px-2.5 text-[12px] font-semibold", tf === t ? "bg-surface-2 text-text" : "text-text-muted hover:text-text")}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="-mx-gutter mt-1 lg:mx-0">
        {candles.isLoading ? (
          <Bar className="mx-gutter h-[200px] lg:mx-0 lg:h-[240px]" />
        ) : candles.isError ? (
          <ErrorState message="Chart data isn't available right now." onRetry={() => candles.refetch()} />
        ) : points.length ? (
          <PriceChart compact points={points} mode="area" up={(movePct ?? 0) >= 0} onScrub={setScrub} formatPrice={(n) => fmtPrice(n)} />
        ) : (
          <div className="grid h-[200px] place-items-center text-secondary text-text-muted">No trades in this range yet</div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-[13px]">
        <span className="text-text-muted">{cap ? `$${compact(cap)} market cap` : c.valueWeightPct != null ? `${pct(c.valueWeightPct)} of value now` : ""}</span>
        <Link href={`/app/stock/${c.provider}/${c.address}`} className="press inline-flex items-center gap-0.5 font-semibold text-link">
          Open {c.ticker} <ChevronRight size={15} />
        </Link>
      </div>
    </div>
  );
}

function BigChange({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-detail-price text-text-muted">—</span>;
  const up = value >= 0;
  return (
    <span className={cn("inline-flex items-center gap-2 text-detail-price tnum", up ? "text-up" : "text-down")}>
      <Triangle up={up} className="h-3.5 w-4" />
      {pct(value)}
    </span>
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

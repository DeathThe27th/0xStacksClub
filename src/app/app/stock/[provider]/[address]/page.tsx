"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Info, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { ChartControls, PriceChart, type Point, type Timeframe } from "@/components/chart/PriceChart";
import { StickyCta } from "@/components/detail/Cta";
import { TradePanel } from "@/components/trade/TradePanel";
import { OverlayToggle, StatsStrip, TradesFeed, useTrades } from "@/components/detail/Trades";
import { PositionCard } from "@/components/trade/PositionCard";
import { FeedTab } from "@/components/detail/Feed";
import { HoldersTab } from "@/components/detail/Holders";
import { DetailTopBar } from "@/components/detail/TopBar";
import { TradesSheet } from "@/components/detail/TradesSheet";
import { BuySheet } from "@/components/trade/BuySheet";
import { DepositSheet } from "@/components/trade/DepositSheet";
import { SellSheet } from "@/components/trade/SellSheet";
import { Change } from "@/components/ui/Change";
import { ProviderPill } from "@/components/ui/ProviderPill";
import { Sheet } from "@/components/ui/Sheet";
import { Bar } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { cn } from "@/lib/cn";
import { MIN_BUY_USD_SMALL, PROVIDER_LABEL, type Provider } from "@/lib/constants";
import { compact, pct, price as fmtPrice, shortAddress, usd } from "@/lib/format";
import { useApi } from "@/lib/client/api";
import { usePortfolio, useWatch } from "@/lib/client/queries";
import type { AssetItem } from "@/lib/client/types";

type Detail = {
  asset: AssetItem;
  price: number | null;
  referencePrice: number | null;
  premiumPct: number | null;
  change24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  marketOpen: boolean | null;
  marketStatus: string | null;
  nextOpenTime: number | null;
  underlying: { high52W?: string | null; low52W?: string | null; peRatioTTM?: string | null } | null;
};
type Candle = { t: number; o: number; h: number; l: number; c: number };

const tfBar: Record<Timeframe, { bar: string; poll?: number; label: string }> = {
  LIVE: { bar: "1m", poll: 5000, label: "1h" },
  "1H": { bar: "1m", label: "1h" },
  "1D": { bar: "5m", label: "24h" },
  "1W": { bar: "1H", label: "7d" },
  ALL: { bar: "1D", label: "All" },
};

export default function StockPage({ params }: { params: Promise<{ provider: string; address: string }> }) {
  const { provider, address } = use(params);
  const api = useApi();
  const [tf, setTf] = useState<Timeframe>("1D");
  const [mode, setMode] = useState<"area" | "candles">("area");
  const [scrub, setScrub] = useState<Point | null>(null);
  const [right, setRight] = useState<0 | 1 | 2>(0);
  const [tab, setTab] = useState<"holders" | "trades" | "feed" | "about">("holders");
  const trades = useTrades("asset", address);
  const [sheet, setSheet] = useState<"buy" | "sell" | "deposit" | "compare" | "history" | null>(null);
  const watch = useWatch("asset", address);
  const portfolio = usePortfolio();

  const detail = useQuery({ queryKey: ["asset", address], queryFn: () => api<Detail>(`/api/assets/${provider}/${address}`), refetchInterval: 10_000 });
  const candles = useQuery({
    queryKey: ["candles", address, tf],
    queryFn: () => api<{ candles: Candle[] }>(`/api/market/candles?address=${address}&bar=${tfBar[tf].bar}`),
    refetchInterval: tfBar[tf].poll,
  });
  const compare = useQuery({
    queryKey: ["compare", detail.data?.asset.ticker],
    queryFn: () => api<{ providers: { address: string }[] }>(`/api/assets/compare/${detail.data!.asset.ticker}`),
    enabled: !!detail.data?.asset.ticker,
  });
  const multiProvider = (compare.data?.providers.length ?? 0) > 1;
  const holders = useQuery({ queryKey: ["holders", "asset", address], queryFn: () => api<{ items: unknown[] }>(`/api/holders?targetType=asset&targetId=${address}`) });

  const points: Point[] = useMemo(() => (candles.data?.candles ?? []).map((c) => ({ t: c.t, value: c.c, o: c.o, h: c.h, l: c.l, c: c.c })), [candles.data]);
  const first = points[0]?.o ?? points[0]?.value;
  const last = detail.data?.price ?? points.at(-1)?.value ?? null;
  const shown = scrub?.value ?? last;
  const change = first && shown !== null ? shown - first : null;
  const changePct = first && change !== null ? (change / first) * 100 : null;
  const up = (changePct ?? 0) >= 0;

  const a = detail.data?.asset;
  const holding = portfolio.data?.holdings.find((h) => h.address.toLowerCase() === address.toLowerCase());
  const usdt = portfolio.data?.usdt.display ?? null;
  const ctaState = !portfolio.data ? "loading" : usdt !== null && usdt < MIN_BUY_USD_SMALL ? "deposit" : holding ? "both" : "buy";
  const disabled = a && !a.can_trade ? (a.vault_ok === false ? "Not supported" : "Not tradable yet") : detail.data?.marketOpen === false ? "Market closed" : null;

  if (detail.isError) return <ErrorState message={(detail.error as Error).message} onRetry={() => detail.refetch()} />;

  const rightBlock = [
    { label: "Market cap", value: detail.data?.marketCap ? `$${compact(detail.data.marketCap)}` : "—" },
    { label: "Reference price", value: fmtPrice(detail.data?.referencePrice) },
    { label: "Premium", value: detail.data?.premiumPct != null ? `${detail.data.premiumPct >= 0 ? "+" : "-"}${pct(detail.data.premiumPct)}` : "—" },
  ][right]!;

  return (
    <div>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6 lg:pt-5">
        <div className="min-w-0">
      <DetailTopBar
        logo={a?.logo_url ?? null}
        title={a?.ticker ?? "…"}
        subtitle={a ? `${a.name}` : "…"}
        copyValue={a?.address}
        watched={watch.watched}
        onWatch={watch.toggle}
        onHistory={() => setSheet("history")}
      />

      <StatsStrip
        items={[
          { label: "Price", value: fmtPrice(detail.data?.price) },
          { label: "Market cap", value: detail.data?.marketCap ? `$${compact(detail.data.marketCap)}` : "—" },
          { label: "24h change", value: <Change value={detail.data?.change24h} /> },
          { label: "24h volume", value: detail.data?.volume24h ? `$${compact(detail.data.volume24h)}` : "—" },
          { label: "Holders (StacksClub)", value: holders.data?.items.length ?? "—" },
          {
            label: detail.data?.marketOpen === false ? "Market closed" : "Premium",
            value: detail.data?.premiumPct != null ? `${detail.data.premiumPct >= 0 ? "+" : "-"}${pct(detail.data.premiumPct)}` : "—",
          },
        ]}
      />

      <section className="mt-4 flex items-start justify-between gap-4 px-gutter lg:mt-6 lg:px-0">
        <div className="min-w-0">
          {detail.isLoading ? <Bar className="h-9 w-40" /> : <p className="text-detail-price tnum">{fmtPrice(shown)}</p>}
          <p className="mt-1 flex items-center gap-2">
            <Change value={changePct} amount={change} />
            <span className="text-change text-text-muted">{scrub ? new Date(scrub.t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : tfBar[tf].label}</span>
          </p>
        </div>
        <button onClick={() => setRight(((right + 1) % 3) as 0 | 1 | 2)} className="press shrink-0 text-right" aria-label={`Showing ${rightBlock.label}. Tap to switch.`}>
          <p className="flex items-center justify-end gap-1 text-[20px] font-semibold tnum">
            <ChevronsUpDown size={16} className="text-text-muted" />
            {rightBlock.value}
          </p>
          <p className="text-secondary text-text-muted">{rightBlock.label}</p>
          {right === 1 && detail.data?.marketOpen === false && <p className="text-[12px] font-medium text-warn">Market closed</p>}
        </button>
      </section>

      <div className="mt-4">
        {candles.isLoading ? (
          <Bar className="mx-gutter h-[320px] lg:mx-0 lg:h-[420px]" />
        ) : candles.isError ? (
          <ErrorState message="Chart data isn't available right now." onRetry={() => candles.refetch()} />
        ) : points.length ? (
          <PriceChart points={points} mode={mode} up={up} onScrub={setScrub} formatPrice={(n) => fmtPrice(n)} markers={trades.markers} />
        ) : (
          <div className="grid h-[320px] place-items-center text-secondary text-text-muted">No trades in this range yet</div>
        )}
        <div className="flex flex-wrap items-center justify-between">
          <OverlayToggle value={trades.overlay} onChange={trades.setOverlay} />
          <ChartControls value={tf} onChange={setTf} mode={mode} onMode={setMode} />
        </div>
      </div>

      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
      <div className="px-gutter lg:px-0">
        <Tabs
          tabs={[
            { id: "holders", label: `Holders (${holders.data?.items.length ?? 0})` },
            { id: "trades", label: "Trades" },
            { id: "feed", label: "Feed" },
            { id: "about", label: "About" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "holders" && <HoldersTab targetType="asset" targetId={address} />}
        {tab === "trades" && <TradesFeed trades={trades.trades} loading={trades.loading} className="pt-3" />}
        {tab === "feed" && <FeedTab targetType="asset" targetId={address} />}
        {tab === "about" && a && (
          <dl className="space-y-4 py-5 text-[15px]">
            <Item label="Provider">
              <ProviderPill provider={a.provider} />
            </Item>
            <Item label="Contract">
              <a href={`https://bscscan.com/token/${a.address}`} target="_blank" rel="noreferrer" className="text-link">
                {shortAddress(a.address)}
              </a>
            </Item>
            <Item label="Token">{a.symbol}</Item>
            <Item label="Decimals">{a.decimals}</Item>
            {a.share_multiplier && <Item label="Shares per token">{Number(a.share_multiplier).toFixed(6)}</Item>}
            {detail.data?.volume24h != null && <Item label="24h volume">{usd(detail.data.volume24h, { compact: true })}</Item>}
            {detail.data?.underlying?.peRatioTTM && <Item label="P/E (TTM)">{Number(detail.data.underlying.peRatioTTM).toFixed(1)}</Item>}
            {detail.data?.underlying?.low52W && detail.data.underlying.high52W && (
              <Item label="52-week range">
                {fmtPrice(Number(detail.data.underlying.low52W))} – {fmtPrice(Number(detail.data.underlying.high52W))}
              </Item>
            )}
            <p className="pt-2 text-secondary text-text-muted">
              {a.symbol} is a token issued by {PROVIDER_LABEL[a.provider as Provider]} that tracks {a.name}. It is not a direct share and doesn&apos;t carry shareholder rights.
              Prices shown are indicative onchain marks.
            </p>
          </dl>
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
            a
              ? { kind: "stock", component: { address: a.address, ticker: a.ticker, provider: a.provider, logoUrl: a.logo_url, price: detail.data?.price ?? null, decimals: a.decimals, weightBps: 10_000 } }
              : null
          }
          sell={holding ? { kind: "stock", holding } : null}
          minBuyUsd={MIN_BUY_USD_SMALL}
          disabledReason={disabled}
          onDeposit={() => setSheet("deposit")}
          onCompare={multiProvider ? () => setSheet("compare") : undefined}
          note={a && <>Issued by {PROVIDER_LABEL[a.provider as Provider]}</>}
        />
        <PositionCard holding={holding} />
        </div>
      </div>

      <StickyCta
        note={
          a && (
            <button onClick={() => setSheet("compare")} className="flex items-center gap-1.5 text-secondary text-text-muted hover:text-text">
              <ShieldCheck size={16} /> Issued by {PROVIDER_LABEL[a.provider as Provider]} <Info size={15} />
            </button>
          )
        }
        state={ctaState}
        disabledReason={disabled}
        minBuyUsd={MIN_BUY_USD_SMALL}
        onDeposit={() => setSheet("deposit")}
        onBuy={() => setSheet("buy")}
        onSell={() => setSheet("sell")}
        onCompare={multiProvider ? () => setSheet("compare") : undefined}
      />

      {a && sheet === "buy" && (
        <BuySheet
          open
          onClose={() => setSheet(null)}
          onDeposit={() => setSheet("deposit")}
          target={{ kind: "stock", component: { address: a.address, ticker: a.ticker, provider: a.provider, logoUrl: a.logo_url, price: detail.data?.price ?? null, decimals: a.decimals, weightBps: 10_000 } }}
        />
      )}
      {holding && sheet === "sell" && <SellSheet open onClose={() => setSheet(null)} target={{ kind: "stock", holding }} />}
      <DepositSheet open={sheet === "deposit"} onClose={() => setSheet(null)} />
      <TradesSheet open={sheet === "history"} onClose={() => setSheet(null)} targetType="asset" targetId={address} />
      {a && <CompareSheet open={sheet === "compare"} onClose={() => setSheet(null)} ticker={a.ticker} current={a.address} />}
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right tnum">{children}</dd>
    </div>
  );
}

type CompareRow = { provider: string; address: string; symbol: string; logoUrl: string | null; price: number | null; perSharePrice: number | null; volume24h: number | null; premiumPct: number | null; cheapest: boolean };

/** Provider comparison for one ticker (UI_SPEC §4.5). */
function CompareSheet({ open, onClose, ticker, current }: { open: boolean; onClose: () => void; ticker: string; current: string }) {
  const api = useApi();
  const q = useQuery({ queryKey: ["compare", ticker], queryFn: () => api<{ providers: CompareRow[] }>(`/api/assets/compare/${ticker}`), enabled: open });
  return (
    <Sheet open={open} onClose={onClose} title={`Buy ${ticker} from`}>
      <p className="-mt-2 mb-4 text-center text-secondary text-text-muted">Each provider issues its own {ticker} token. Prices and fees can differ, so pick the one you want.</p>
      <div className="space-y-2">
        {(q.data?.providers ?? []).map((p) => (
          <Link
            key={p.address}
            href={`/app/stock/${p.provider}/${p.address}`}
            onClick={onClose}
            className={cn("press flex items-center gap-3 rounded-card bg-surface-2 p-4", p.address.toLowerCase() === current.toLowerCase() && "ring-1 ring-primary")}
          >
            <TokenLogo src={p.logoUrl} label={p.symbol} size={36} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[16px] font-semibold">
                {PROVIDER_LABEL[p.provider as Provider]}
                {p.cheapest && <span className="rounded-badge bg-up/15 px-1.5 py-0.5 text-[11px] font-semibold text-up">Cheaper</span>}
              </p>
              <p className="text-[13px] text-text-muted">
                {p.symbol} · Vol {p.volume24h ? `$${compact(p.volume24h)}` : "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[16px] font-medium tnum">{fmtPrice(p.price)}</p>
              <p className="text-[13px] text-text-muted tnum">Premium {p.premiumPct != null ? `${p.premiumPct >= 0 ? "+" : "-"}${pct(p.premiumPct)}` : "—"}</p>
            </div>
          </Link>
        ))}
        {q.data && q.data.providers.length < 2 && <p className="pt-2 text-center text-secondary text-text-muted">Only one provider offers {ticker} on BNB Chain right now.</p>}
      </div>
    </Sheet>
  );
}

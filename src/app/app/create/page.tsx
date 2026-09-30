"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronLeft, ImagePlus, Lock, LockOpen, Minus, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { decodeEventLog, encodeFunctionData, formatUnits, getAddress } from "viem";
import { Button } from "@/components/ui/Button";
import { ProviderPill } from "@/components/ui/ProviderPill";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/States";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { cn } from "@/lib/cn";
import { PROVIDER_LABEL, type Provider } from "@/lib/constants";
import { vaultAbi } from "@/lib/contracts/vault";
import { price as fmtPrice, usd } from "@/lib/format";
import { equalWeights, MIN_BPS, moveBoundary, proportionalWeights, setWeight, TOTAL_BPS } from "@/lib/weights";
import { useApi } from "@/lib/client/api";
import { squareCrop } from "@/lib/client/image";
import { vaultAddr } from "@/lib/client/runner";
import type { AssetItem } from "@/lib/client/types";
import { browserPublicClient, useSigner } from "@/lib/client/wallet";
import { normalizeTelegramUrl } from "@/lib/telegram";

type Pick = { ticker: string; options: AssetItem[]; chosen: string };
const COLORS = ["#3D5AFE", "#22C55E", "#F5A524", "#A855F7", "#06B6D4"];
/** Text colour that reads on each of COLORS (white on the blue and purple, near-black on the rest). */
const COLORS_INK = ["#FFFFFF", "#04210F", "#2B1A00", "#FFFFFF", "#032A31"];

export default function CreateStack() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [weights, setWeights] = useState<number[]>([]); // bps

  const setEqual = (n: number) => setWeights(equalWeights(n));

  return (
    <div className="px-gutter pt-3 lg:mx-auto lg:max-w-[640px] lg:px-0 lg:pt-8">
      <header className="flex items-center gap-2">
        <button onClick={() => (step === 1 ? router.back() : setStep((step - 1) as 1 | 2))} aria-label="Back" className="press -ml-2 grid h-11 w-11 place-items-center text-text-muted hover:text-text">
          <ChevronLeft size={26} />
        </button>
        <h1 className="flex-1 text-[18px] font-bold">Create a basket</h1>
        <span className="text-secondary text-text-muted tnum">{step} of 3</span>
      </header>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${(step / 3) * 100}%` }} />
      </div>

      {step === 1 && (
        <PickStep
          picks={picks}
          setPicks={setPicks}
          onNext={() => {
            setEqual(picks.length);
            setStep(2);
          }}
        />
      )}
      {step === 2 && <WeightStep picks={picks} weights={weights} setWeights={setWeights} onNext={() => setStep(3)} />}
      {step === 3 && <DetailsStep picks={picks} weights={weights} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: pick 2 to 5 stocks
// ---------------------------------------------------------------------------

function PickStep({ picks, setPicks, onNext }: { picks: Pick[]; setPicks: (p: Pick[]) => void; onNext: () => void }) {
  const api = useApi();
  const [q, setQ] = useState("");
  const assets = useQuery({ queryKey: ["asset-lookup"], queryFn: () => api<{ items: AssetItem[] }>("/api/assets?tab=stocks&filter=trending&limit=500") });
  // Only allowlisted assets enabled for Stacks.
  const byTicker = useMemo(() => {
    const m = new Map<string, AssetItem[]>();
    for (const a of assets.data?.items ?? []) {
      if (!a.can_stack) continue;
      m.set(a.ticker, [...(m.get(a.ticker) ?? []), a].sort((x, y) => Number(x.provider !== "bstock") - Number(y.provider !== "bstock")));
    }
    return m;
  }, [assets.data]);
  const results = [...byTicker.entries()].filter(([t, opts]) => {
    const s = q.trim().toLowerCase();
    return !s || t.toLowerCase().includes(s) || opts[0]!.name.toLowerCase().includes(s);
  });
  const chosen = new Set(picks.map((p) => p.ticker));

  const add = (ticker: string, options: AssetItem[]) => {
    if (picks.length >= 5 || chosen.has(ticker)) return;
    setPicks([...picks, { ticker, options, chosen: (options.find((o) => o.provider === "bstock") ?? options[0]!).address }]);
  };

  return (
    <div className="pb-28 lg:pb-0">
      <h2 className="mt-6 text-[22px] font-bold">Pick 2 to 5 stocks</h2>
      <p className="mt-1 text-secondary text-text-muted">Each is a provider token on BNB Chain. bStocks is picked by default when both exist.</p>

      {picks.length > 0 && (
        <ul className="mt-4 space-y-2">
          {picks.map((p, i) => (
            <li key={p.ticker} className="flex items-center gap-3 rounded-card bg-surface p-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i] }} />
              <TokenLogo src={p.options.find((o) => o.address === p.chosen)?.logo_url} label={p.ticker} size={32} />
              <span className="flex-1 text-[16px] font-semibold">{p.ticker}</span>
              {p.options.length > 1 ? (
                <div className="flex rounded-chip bg-surface-2 p-0.5" role="radiogroup" aria-label={`${p.ticker} provider`}>
                  {p.options.map((o) => (
                    <button
                      key={o.address}
                      role="radio"
                      aria-checked={o.address === p.chosen}
                      onClick={() => setPicks(picks.map((x) => (x.ticker === p.ticker ? { ...x, chosen: o.address } : x)))}
                      className={cn("h-8 rounded-[10px] px-2.5 text-[13px] font-medium", o.address === p.chosen ? "bg-surface text-text" : "text-text-muted")}
                    >
                      {PROVIDER_LABEL[o.provider as Provider]}
                    </button>
                  ))}
                </div>
              ) : (
                <ProviderPill provider={p.options[0]!.provider} />
              )}
              <button onClick={() => setPicks(picks.filter((x) => x.ticker !== p.ticker))} aria-label={`Remove ${p.ticker}`} className="grid h-8 w-8 place-items-center text-text-muted hover:text-text">
                <X size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="mt-5 flex h-12 items-center gap-2 rounded-chip border border-border bg-surface px-3 focus-within:border-primary">
        <Search size={18} className="text-text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stocks" aria-label="Search stocks" className="h-full flex-1 bg-transparent text-[16px] outline-none" />
      </label>
      <div className="mt-2">
        {assets.isLoading ? (
          <RowSkeleton count={5} />
        ) : !byTicker.size ? (
          <EmptyState icon={<Lock size={24} />} title="No stocks enabled for baskets yet" body="Stocks appear here once they pass the vault check and have a USDT route." />
        ) : (
          results.slice(0, 60).map(([ticker, opts]) => {
            const a = opts[0]!;
            const isChosen = chosen.has(ticker);
            return (
              <button
                key={ticker}
                onClick={() => add(ticker, opts)}
                disabled={isChosen || picks.length >= 5}
                className="press -mx-2 flex h-row w-[calc(100%+16px)] items-center gap-3 rounded-card px-2 text-left hover:bg-surface/60 disabled:opacity-60"
              >
                <TokenLogo src={a.logo_url} label={ticker} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold">{ticker}</p>
                  <p className="truncate text-secondary text-text-muted">
                    {a.name} · {opts.map((o) => PROVIDER_LABEL[o.provider as Provider]).join(", ")}
                  </p>
                </div>
                <span className="text-[14px] text-text-muted tnum">{fmtPrice(a.price?.price_usd ? Number(a.price.price_usd) : null)}</span>
                <span className={cn("grid h-8 w-8 place-items-center rounded-full", isChosen ? "bg-up text-bg" : "bg-surface-2")}>{isChosen ? <Check size={16} /> : <Plus size={16} />}</span>
              </button>
            );
          })
        )}
      </div>

      <Footer>
        <Button className="w-full" disabled={picks.length < 2} onClick={onNext}>
          {picks.length < 2 ? `Pick ${2 - picks.length} more` : `Next: weights`}
        </Button>
      </Footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: weights
// ---------------------------------------------------------------------------

/** Buy used to show what a weight means in money: $100, less the 1% buy fee. */
const EXAMPLE_NET_USD = 99;
/** One drag or stepper tick: 1%. Exact values (down to 0.01%) can be typed. */
const STEP_BPS = 100;

/**
 * The split is one bar. Drag a boundary to move weight between two neighbours, or set a number on
 * a row and the unlocked others make room. Every edit goes through src/lib/weights.ts, so the
 * total is always exactly 100% and there is no "doesn't add up" state to fix.
 */
function WeightStep({ picks, weights, setWeights, onNext }: { picks: Pick[]; weights: number[]; setWeights: (w: number[]) => void; onNext: () => void }) {
  const [locked, setLocked] = useState<Set<number>>(new Set());
  const [drag, setDrag] = useState<{ k: number; x: number; start: number[] } | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const assets = picks.map((p) => p.options.find((o) => o.address === p.chosen) ?? p.options[0]!);
  const byCap = proportionalWeights(assets.map((a) => (a.price?.market_cap ? Number(a.price.market_cap) : null)));
  const same = (a: number[] | null, b: number[]) => !!a && a.length === b.length && a.every((v, i) => v === b[i]);
  const equal = equalWeights(picks.length);
  const ok = weights.length === picks.length && weights.reduce((a, b) => a + b, 0) === TOTAL_BPS && weights.every((w) => w >= MIN_BPS);

  const toggleLock = (i: number) => {
    const next = new Set(locked);
    if (!next.delete(i)) next.add(i);
    // Two stocks have to stay free: the one being changed and one to take up the slack.
    if (next.size < locked.size || next.size <= picks.length - 2) setLocked(next);
  };
  const preset = (w: number[]) => {
    setLocked(new Set());
    setWeights(w);
  };

  let cumulative = 0;
  return (
    <div className="pb-28 lg:pb-0">
      <h2 className="mt-6 text-[22px] font-bold">Set the weights</h2>
      <p className="mt-1 text-secondary text-text-muted">Drag the bar or set a number. It always adds up to 100%, and it can&apos;t change after launch.</p>

      <div
        ref={bar}
        className="relative mt-5 flex h-[68px] gap-[2px] overflow-hidden rounded-card bg-bg select-none"
        role="group"
        aria-label="Weight split"
      >
        {picks.map((p, i) => {
          const w = weights[i] ?? 0;
          return (
            <div
              key={p.ticker}
              className={cn("flex min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden", !drag && "transition-[flex-basis] duration-200 ease-out")}
              style={{ flexBasis: `${w / 100}%`, background: COLORS[i], color: COLORS_INK[i] }}
            >
              {w >= 900 && <span className="text-[12px] font-semibold leading-none">{p.ticker}</span>}
              {w >= 600 && <span className="text-[15px] font-bold leading-none tnum">{Math.round(w / 100)}%</span>}
            </div>
          );
        })}
        {picks.slice(0, -1).map((p, k) => {
          cumulative += weights[k] ?? 0;
          const fixed = locked.has(k) || locked.has(k + 1);
          const next = picks[k + 1]!;
          const move = (delta: number) => setWeights(moveBoundary(weights, k, delta));
          return (
            <button
              key={p.ticker}
              type="button"
              role="slider"
              aria-label={`Between ${p.ticker} and ${next.ticker}`}
              aria-valuemin={1}
              aria-valuemax={Math.round(((weights[k] ?? 0) + (weights[k + 1] ?? 0) - MIN_BPS) / 100)}
              aria-valuenow={Math.round((weights[k] ?? 0) / 100)}
              aria-valuetext={`${p.ticker} ${((weights[k] ?? 0) / 100).toFixed(2)}%, ${next.ticker} ${((weights[k + 1] ?? 0) / 100).toFixed(2)}%`}
              disabled={fixed}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag({ k, x: e.clientX, start: weights });
                navigator.vibrate?.(5);
              }}
              onPointerMove={(e) => {
                if (!drag || drag.k !== k || !bar.current) return;
                const bps = ((e.clientX - drag.x) / bar.current.clientWidth) * TOTAL_BPS;
                setWeights(moveBoundary(drag.start, k, Math.round(bps / STEP_BPS) * STEP_BPS));
              }}
              onPointerUp={() => setDrag(null)}
              onPointerCancel={() => setDrag(null)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowUp") move(STEP_BPS);
                else if (e.key === "ArrowLeft" || e.key === "ArrowDown") move(-STEP_BPS);
                else return;
                e.preventDefault();
              }}
              className={cn(
                "absolute top-0 grid h-full w-8 -translate-x-1/2 touch-none place-items-center",
                fixed ? "cursor-not-allowed" : "cursor-ew-resize",
                !drag && "transition-[left] duration-200 ease-out",
              )}
              style={{ left: `${cumulative / 100}%` }}
            >
              <span
                className={cn(
                  "h-8 w-[7px] rounded-full border border-text/15 bg-bg shadow-[0_1px_4px_rgb(0_0_0/0.35)] transition-transform duration-150",
                  fixed ? "opacity-40" : drag?.k === k ? "scale-y-125" : "",
                )}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <PresetChip active={same(equal, weights)} onClick={() => preset(equal)}>
          Equal
        </PresetChip>
        {byCap && (
          <PresetChip active={same(byCap, weights)} onClick={() => preset(byCap)}>
            By market cap
          </PresetChip>
        )}
      </div>

      <ul className="mt-4 divide-y divide-border/70">
        {picks.map((p, i) => {
          const w = weights[i] ?? 0;
          const isLocked = locked.has(i);
          const othersFree = picks.some((_, j) => j !== i && !locked.has(j));
          const set = (v: number) => setWeights(setWeight(weights, i, v, locked));
          return (
            <li key={p.ticker} className="flex items-center gap-3 py-3">
              <span className="shrink-0 rounded-full p-[2px]" style={{ background: COLORS[i] }}>
                <span className="block rounded-full bg-bg p-[2px]">
                  <TokenLogo src={assets[i]!.logo_url} label={p.ticker} size={32} />
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-semibold">{p.ticker}</p>
                <p className="truncate text-[13px] text-text-muted tnum">{usd((EXAMPLE_NET_USD * w) / TOTAL_BPS)} of $100</p>
              </div>
              <div className={cn("flex h-11 shrink-0 items-center rounded-chip border bg-surface", isLocked ? "border-border opacity-60" : "border-border focus-within:border-primary")}>
                <button type="button" onClick={() => set(w - STEP_BPS)} disabled={isLocked || !othersFree || w <= MIN_BPS} aria-label={`Less ${p.ticker}`} className="press grid h-full w-10 place-items-center text-text-muted hover:text-text disabled:opacity-40">
                  <Minus size={16} />
                </button>
                <WeightInput label={`${p.ticker} weight percent`} bps={w} disabled={isLocked || !othersFree} onChange={set} />
                <button type="button" onClick={() => set(w + STEP_BPS)} disabled={isLocked || !othersFree} aria-label={`More ${p.ticker}`} className="press grid h-full w-10 place-items-center text-text-muted hover:text-text disabled:opacity-40">
                  <Plus size={16} />
                </button>
              </div>
              {picks.length > 2 && (
                <button
                  type="button"
                  onClick={() => toggleLock(i)}
                  disabled={!isLocked && locked.size >= picks.length - 2}
                  aria-pressed={isLocked}
                  aria-label={isLocked ? `Unlock ${p.ticker}` : `Keep ${p.ticker} at this weight`}
                  className={cn("press -mr-2 grid h-11 w-10 shrink-0 place-items-center disabled:opacity-30", isLocked ? "text-text" : "text-text-muted hover:text-text")}
                >
                  {isLocked ? <Lock size={17} /> : <LockOpen size={17} />}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[13px] leading-5 text-text-muted">
        Dollar amounts are what a $100 buy puts into each stock after the 1% fee.{picks.length > 2 && " Lock a stock to hold its weight while you change the others."}
      </p>

      <Footer>
        <Button className="w-full" disabled={!ok} onClick={onNext}>
          Next: details
        </Button>
      </Footer>
    </div>
  );
}

function PresetChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("press h-9 rounded-chip px-3.5 text-[14px] font-medium transition-colors", active ? "bg-chip-active text-text" : "bg-chip text-text-muted hover:text-text")}
    >
      {children}
    </button>
  );
}

/** Percent field that keeps the typed text ("33.", "0.5") while editing; bps is the source of truth. */
function WeightInput({ label, bps, disabled, onChange }: { label: string; bps: number; disabled?: boolean; onChange: (bps: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = (bps / 100).toFixed(bps % 100 === 0 ? 0 : 2);
  return (
    <label className="flex h-full items-center">
      <input
        inputMode="decimal"
        aria-label={label}
        disabled={disabled}
        value={draft ?? shown}
        onFocus={(e) => {
          setDraft(shown);
          e.currentTarget.select();
        }}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.]/g, "");
          if (!/^\d{0,3}(\.\d{0,2})?$/.test(v)) return;
          setDraft(v);
          // Applied as typed once it's a usable number; the others make room straight away.
          if (Number(v) >= 1) onChange(Math.round(Math.min(100, Number(v)) * 100));
        }}
        className="w-[52px] bg-transparent text-right text-[16px] font-semibold outline-none tnum disabled:text-text-muted"
      />
      <span className="ml-0.5 text-[14px] text-text-muted">%</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Step 3: details and launch
// ---------------------------------------------------------------------------

function DetailsStep({ picks, weights }: { picks: Pick[]; weights: number[] }) {
  const api = useApi();
  const router = useRouter();
  const getSigner = useSigner();
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [telegram, setTelegram] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tickerFormat = /^[A-Z]{2,6}$/.test(ticker);
  const avail = useQuery({
    queryKey: ["ticker", ticker],
    queryFn: () => api<{ available: boolean }>(`/api/stacks/ticker?t=${ticker}`),
    enabled: tickerFormat,
  });
  const gas = useQuery({
    queryKey: ["gas-create"],
    queryFn: async () => (await browserPublicClient().getGasPrice()) * 450_000n,
  });
  const nameOk = name.trim().length >= 3 && name.trim().length <= 32;
  const telegramOk = !telegram.trim() || normalizeTelegramUrl(telegram) !== null;
  const ready = !!image && nameOk && tickerFormat && avail.data?.available === true && description.length <= 280 && telegramOk;

  const launch = async () => {
    setError(null);
    try {
      setStatus("Uploading image");
      const form = new FormData();
      form.set("name", name.trim());
      form.set("ticker", ticker);
      form.set("description", description.trim());
      if (telegram.trim()) form.set("telegram", telegram.trim());
      form.set("image", image!);
      const { metadataURI } = await api<{ metadataURI: string }>("/api/stacks/metadata", { method: "POST", body: form });

      setStatus("Confirm in your wallet");
      const signer = await getSigner();
      const assets = picks.map((p) => getAddress(p.chosen));
      const hash = await signer.sendTransaction({
        to: vaultAddr(),
        data: encodeFunctionData({ abi: vaultAbi, functionName: "createStack", args: [assets, weights, metadataURI, ticker] }),
      });
      setStatus("Launching onchain");
      const receipt = await browserPublicClient().waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Launch transaction reverted");
      let stackId: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: vaultAbi, data: log.data, topics: log.topics });
          if (ev.eventName === "StackCreated") stackId = ev.args.stackId;
        } catch {
          /* other logs */
        }
      }
      if (stackId === null) throw new Error("Basket created, but its id wasn't found in the receipt");
      setStatus("Indexing");
      // The Stack exists onchain at this point; a sync hiccup must not strand the creator.
      // The background sync picks it up if this call fails.
      await api("/api/sync", { method: "POST", json: { txHash: hash } }).catch(() => undefined);
      router.replace(`/app/basket/${stackId}?created=1`);
    } catch (e) {
      setStatus(null);
      const m = (e as Error).message;
      setError(/rejected|denied/i.test(m) ? "You cancelled the signature." : m);
    }
  };

  return (
    <div className="pb-28 lg:pb-0">
      <h2 className="mt-6 text-[22px] font-bold">Name your basket</h2>
      <div className="mt-5 flex items-center gap-4">
        <button onClick={() => fileRef.current?.click()} className="press grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border border-dashed border-border bg-surface text-text-muted" aria-label="Upload image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={26} />}
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // let the same file be picked again after an error
            if (!f) return;
            try {
              const cropped = await squareCrop(f);
              if (cropped.size > 2 * 1024 * 1024) return setError("Image must be 2MB or smaller");
              setError(null);
              setImage(cropped);
              setPreview((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return URL.createObjectURL(cropped);
              });
            } catch {
              setError("Couldn't read that image. Try a PNG or JPG.");
            }
          }}
        />
        <p className="text-secondary text-text-muted">Square image, up to 2MB. This is your basket&apos;s logo.</p>
      </div>

      <div className="mt-5 space-y-4">
        <Labeled label="Name" hint={`${name.length}/32`}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="AI Kings" className="h-12 w-full bg-transparent px-4 outline-none" />
        </Labeled>
        <Labeled
          label="Ticker"
          hint={!ticker ? "2 to 6 letters" : !tickerFormat ? "2 to 6 letters, A to Z" : avail.isLoading ? "Checking…" : avail.data?.available ? "Available" : "Taken"}
          hintTone={!ticker ? undefined : !tickerFormat || avail.data?.available === false ? "down" : avail.data?.available ? "up" : undefined}
        >
          <div className="flex items-center">
            <span className="pl-4 text-text-muted">$</span>
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6))} placeholder="AIK" autoCapitalize="characters" className="h-12 flex-1 bg-transparent pl-1 pr-4 uppercase outline-none" />
          </div>
        </Labeled>
        <Labeled label="Description" hint={`${description.length}/280`}>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} rows={3} placeholder="What's the thesis?" className="w-full resize-none bg-transparent px-4 py-3 outline-none" />
        </Labeled>
        <Labeled
          label="Telegram group link (optional)"
          hint={telegram.trim() && !telegramOk ? "Not a Telegram link" : "Only holders see it"}
          hintTone={telegram.trim() && !telegramOk ? "down" : undefined}
        >
          <input value={telegram} onChange={(e) => setTelegram(e.target.value)} maxLength={200} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="t.me/yourgroup" className="h-12 w-full bg-transparent px-4 outline-none" />
        </Labeled>
      </div>

      <section className="mt-6 rounded-card bg-surface p-4">
        <p className="text-[15px] font-semibold">
          {name || "Untitled"} {ticker && <span className="text-text-muted">${ticker}</span>}
        </p>
        <ul className="mt-3 space-y-2">
          {picks.map((p, i) => (
            <li key={p.ticker} className="flex items-center gap-2 text-[14px]">
              <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i] }} />
              <span className="flex-1">
                {p.ticker} <span className="text-text-muted">{PROVIDER_LABEL[p.options.find((o) => o.address === p.chosen)!.provider as Provider]}</span>
              </span>
              <span className="tnum">{(weights[i]! / 100).toFixed(2)}%</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-border pt-3 text-[14px]">
          <span className="text-text-muted">Estimated gas</span>
          <span className="tnum">{gas.data ? `${Number(formatUnits(gas.data, 18)).toFixed(5)} BNB` : "…"}</span>
        </div>
        <div className="mt-1 flex justify-between text-[14px]">
          <span className="text-text-muted">App fee</span>
          <span>Free</span>
        </div>
      </section>
      <p className="mt-4 flex gap-2 text-secondary text-warn">
        <AlertTriangle size={18} className="shrink-0" /> The recipe can&apos;t be changed after launch. You earn 25% of the 1% buy fee whenever someone buys it.
      </p>
      {error && (
        <p className="mt-3 text-center text-secondary text-down" role="alert">
          {error}
        </p>
      )}
      <Footer>
        <Button className="w-full" disabled={!ready} loading={!!status} onClick={launch}>
          {status ?? "Launch basket"}
        </Button>
      </Footer>
    </div>
  );
}

function Labeled({ label, hint, hintTone, children }: { label: string; hint?: string; hintTone?: "up" | "down"; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex justify-between text-secondary">
        <span className="text-text-muted">{label}</span>
        {hint && <span className={cn(hintTone === "up" ? "text-up" : hintTone === "down" ? "text-down" : "text-text-muted")}>{hint}</span>}
      </span>
      <span className="block rounded-chip border border-border bg-surface focus-within:border-primary">{children}</span>
    </label>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-app bg-gradient-to-t from-bg via-bg to-transparent px-gutter pt-6 lg:static lg:mt-8 lg:max-w-none lg:bg-none lg:px-0 lg:pt-0" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
      {children}
    </div>
  );
}

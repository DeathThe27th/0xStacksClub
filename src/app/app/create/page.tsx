"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronLeft, ImagePlus, Lock, Plus, Search, X } from "lucide-react";
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
import { price as fmtPrice } from "@/lib/format";
import { useApi } from "@/lib/client/api";
import { squareCrop } from "@/lib/client/image";
import { vaultAddr } from "@/lib/client/runner";
import type { AssetItem } from "@/lib/client/types";
import { browserPublicClient, useSigner } from "@/lib/client/wallet";

type Pick = { ticker: string; options: AssetItem[]; chosen: string };
const COLORS = ["#3D5AFE", "#22C55E", "#F5A524", "#A855F7", "#06B6D4"];

export default function CreateStack() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [weights, setWeights] = useState<number[]>([]); // bps

  const setEqual = (n: number) => {
    const base = Math.floor(10_000 / n);
    setWeights(Array.from({ length: n }, (_, i) => (i === 0 ? 10_000 - base * (n - 1) : base)));
  };

  return (
    <div className="px-gutter pt-3">
      <header className="flex items-center gap-2">
        <button onClick={() => (step === 1 ? router.back() : setStep((step - 1) as 1 | 2))} aria-label="Back" className="press -ml-2 grid h-11 w-11 place-items-center text-text-muted hover:text-text">
          <ChevronLeft size={26} />
        </button>
        <h1 className="flex-1 text-[18px] font-bold">Create a Stack</h1>
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
      {step === 2 && <WeightStep picks={picks} weights={weights} setWeights={setWeights} onEqual={() => setEqual(picks.length)} onNext={() => setStep(3)} />}
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
      m.set(a.ticker, [...(m.get(a.ticker) ?? []), a].sort((x) => (x.provider === "bstock" ? -1 : 1)));
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
    <div className="pb-28">
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
          <EmptyState icon={<Lock size={24} />} title="No stocks enabled for Stacks yet" body="Stocks appear here once they pass the vault check and have a USDT route." />
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

function WeightStep({ picks, weights, setWeights, onEqual, onNext }: { picks: Pick[]; weights: number[]; setWeights: (w: number[]) => void; onEqual: () => void; onNext: () => void }) {
  const total = weights.reduce((a, b) => a + b, 0);
  const ok = total === 10_000 && weights.every((w) => w > 0);
  return (
    <div className="pb-28">
      <h2 className="mt-6 text-[22px] font-bold">Set the weights</h2>
      <p className="mt-1 text-secondary text-text-muted">Each buy splits the money by these weights. They can&apos;t change after launch.</p>

      <div className="mt-6 flex items-center gap-5">
        <Donut weights={weights} />
        <div>
          <p className={cn("text-[28px] font-bold tnum", ok ? "text-text" : "text-down")}>{(total / 100).toFixed(2)}%</p>
          <p className="text-secondary text-text-muted">{ok ? "Adds up to 100%" : `Must total 100.00%`}</p>
          <button onClick={onEqual} className="press mt-2 h-9 rounded-chip bg-surface-2 px-3 text-[14px] font-medium">
            Equal weights
          </button>
        </div>
      </div>

      <ul className="mt-6 space-y-5">
        {picks.map((p, i) => (
          <li key={p.ticker}>
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />
              <span className="flex-1 text-[16px] font-semibold">{p.ticker}</span>
              <label className="flex h-10 items-center rounded-chip border border-border bg-surface px-3 focus-within:border-primary">
                <input
                  inputMode="decimal"
                  aria-label={`${p.ticker} weight percent`}
                  value={(weights[i]! / 100).toString()}
                  onChange={(e) => {
                    const v = Math.round(Math.min(100, Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)) * 100);
                    setWeights(weights.map((w, j) => (j === i ? v : w)));
                  }}
                  className="w-14 bg-transparent text-right text-[16px] outline-none tnum"
                />
                <span className="ml-0.5 text-text-muted">%</span>
              </label>
            </div>
            <input
              type="range"
              min={0}
              max={10_000}
              step={50}
              value={weights[i]}
              onChange={(e) => setWeights(weights.map((w, j) => (j === i ? Number(e.target.value) : w)))}
              aria-label={`${p.ticker} weight`}
              className="mt-2 w-full"
              style={{ accentColor: COLORS[i] }}
            />
          </li>
        ))}
      </ul>
      <Footer>
        <Button className="w-full" disabled={!ok} onClick={onNext}>
          Next: details
        </Button>
      </Footer>
    </div>
  );
}

function Donut({ weights }: { weights: number[] }) {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const r = 38;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" role="img" aria-label="Weight split">
      <circle cx="52" cy="52" r={r} fill="none" stroke="rgb(var(--surface-2))" strokeWidth="16" />
      {weights.map((w, i) => {
        const len = (w / total) * c;
        const el = (
          <circle key={i} cx="52" cy="52" r={r} fill="none" stroke={COLORS[i]} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 52 52)" />
        );
        offset += len;
        return el;
      })}
    </svg>
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
  const ready = !!image && nameOk && tickerFormat && avail.data?.available === true && description.length <= 280;

  const launch = async () => {
    setError(null);
    try {
      setStatus("Uploading image");
      const form = new FormData();
      form.set("name", name.trim());
      form.set("ticker", ticker);
      form.set("description", description.trim());
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
      if (stackId === null) throw new Error("Stack created, but its id wasn't found in the receipt");
      setStatus("Indexing");
      await api("/api/sync", { method: "POST", json: { txHash: hash } });
      router.replace(`/app/stack/${stackId}?created=1`);
    } catch (e) {
      setStatus(null);
      const m = (e as Error).message;
      setError(/rejected|denied/i.test(m) ? "You cancelled the signature." : m);
    }
  };

  return (
    <div className="pb-28">
      <h2 className="mt-6 text-[22px] font-bold">Name your Stack</h2>
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
            if (!f) return;
            const cropped = await squareCrop(f);
            if (cropped.size > 2 * 1024 * 1024) return setError("Image must be 2MB or smaller");
            setImage(cropped);
            setPreview(URL.createObjectURL(cropped));
          }}
        />
        <p className="text-secondary text-text-muted">Square image, up to 2MB. This is your Stack&apos;s logo.</p>
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
          {status ?? "Launch Stack"}
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
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-app bg-gradient-to-t from-bg via-bg to-transparent px-gutter pt-6" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
      {children}
    </div>
  );
}

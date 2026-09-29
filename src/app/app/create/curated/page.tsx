"use client";

import { Check, Layers, Rocket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { decodeEventLog, encodeFunctionData, getAddress } from "viem";
import { Button } from "@/components/ui/Button";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { BASKET_CATEGORIES, CURATED_BASKETS, CURATOR_WALLETS, type CuratedBasket } from "@/lib/baskets";
import { vaultAbi } from "@/lib/contracts/vault";
import { useApi } from "@/lib/client/api";
import { useStacks } from "@/lib/client/queries";
import { vaultAddr } from "@/lib/client/runner";
import { browserPublicClient, useActiveWallet, useSigner } from "@/lib/client/wallet";

/**
 * Curator-only launcher for the curated baskets in src/lib/baskets.ts. Each launch is the same
 * createStack the create flow sends, signed by the curator's own wallet; this page only fills in
 * the recipe, metadata and a generated cover.
 */
export default function CuratedLaunchPage() {
  const wallet = useActiveWallet();
  const stacks = useStacks("newest");
  const api = useApi();
  const getSigner = useSigner();
  const [status, setStatus] = useState<Record<string, { state: "working" | "done" | "error"; note: string; id?: string }>>({});
  const [all, setAll] = useState(false);

  const allowed = !!wallet && CURATOR_WALLETS.includes(wallet.address.toLowerCase());
  const live = new Map((stacks.data?.items ?? []).map((s) => [s.ticker, s.id]));

  const launch = async (b: CuratedBasket) => {
    const set = (state: "working" | "done" | "error", note: string, id?: string) => setStatus((p) => ({ ...p, [b.ticker]: { state, note, id } }));
    try {
      set("working", "Checking ticker");
      const avail = await api<{ available: boolean }>(`/api/stacks/ticker?t=${b.ticker}`);
      if (!avail.available) throw new Error(`$${b.ticker} is already taken`);
      set("working", "Uploading cover");
      const form = new FormData();
      form.set("name", b.name);
      form.set("ticker", b.ticker);
      form.set("description", b.description);
      form.set("image", await coverImage(b));
      const { metadataURI } = await api<{ metadataURI: string }>("/api/stacks/metadata", { method: "POST", body: form });

      set("working", "Sign in your wallet");
      const signer = await getSigner();
      const hash = await signer.sendTransaction({
        to: vaultAddr(),
        data: encodeFunctionData({
          abi: vaultAbi,
          functionName: "createStack",
          args: [b.components.map((c) => getAddress(c.address)), b.components.map((c) => c.weightBps), metadataURI, b.ticker],
        }),
      });
      set("working", "Launching onchain");
      const receipt = await browserPublicClient().waitForTransactionReceipt({ hash, pollingInterval: 400 });
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
      // The basket exists onchain now; the background sync picks it up if this call fails.
      await api("/api/sync", { method: "POST", json: { txHash: hash } }).catch(() => undefined);
      set("done", "Live", stackId?.toString());
      void stacks.refetch();
      return true;
    } catch (e) {
      const m = (e as Error).message;
      set("error", /rejected|denied/i.test(m) ? "You cancelled the signature." : m);
      return false;
    }
  };

  const launchAll = async () => {
    setAll(true);
    for (const b of CURATED_BASKETS) {
      if (live.has(b.ticker) || status[b.ticker]?.state === "done") continue;
      if (!(await launch(b))) break;
    }
    setAll(false);
  };

  if (!wallet) return <RowSkeleton />;
  if (!allowed) return <EmptyState icon={<Layers size={24} />} title="Curators only" body="This page launches the app's curated baskets." />;
  if (stacks.isError) return <ErrorState message={(stacks.error as Error).message} onRetry={() => stacks.refetch()} />;

  const pending = CURATED_BASKETS.filter((b) => !live.has(b.ticker) && status[b.ticker]?.state !== "done");
  return (
    <div className="px-gutter pb-10 pt-6 lg:px-0">
      <h1 className="text-[24px] font-bold">Curated baskets</h1>
      <p className="mt-1 max-w-[60ch] text-secondary text-text-muted">
        Each launch uploads a cover, then asks your wallet to sign one createStack transaction. You&apos;ll be the creator and earn the 0.25% creator fee on every buy.
      </p>
      <Button className="mt-5 w-full lg:w-auto" loading={all} disabled={!pending.length || stacks.isLoading} onClick={launchAll}>
        <Rocket size={18} /> {pending.length ? `Launch ${pending.length} baskets` : "All launched"}
      </Button>

      {stacks.isLoading ? (
        <RowSkeleton />
      ) : (
        BASKET_CATEGORIES.map((cat) => {
          const items = CURATED_BASKETS.filter((b) => b.category === cat.id);
          if (!items.length) return null;
          return (
            <section key={cat.id} className="mt-8">
              <h2 className="text-[15px] font-semibold">{cat.label}</h2>
              <ul className="mt-2 space-y-2">
                {items.map((b) => {
                  const st = status[b.ticker];
                  const id = live.get(b.ticker) ?? (st?.state === "done" ? st.id : undefined);
                  return (
                    <li key={b.ticker} className="flex items-center gap-3 rounded-card border border-border bg-surface p-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${b.colors[0]}, ${b.colors[1]})` }}>
                        {b.ticker}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold">
                          {b.name} <span className="font-normal text-text-muted">${b.ticker}</span>
                        </p>
                        <p className="truncate text-[13px] text-text-muted">{b.components.map((c) => `${c.ticker} ${c.weightBps / 100}%`).join(" · ")}</p>
                        {st && st.state !== "done" && <p className={st.state === "error" ? "text-[13px] text-down" : "text-[13px] text-text-muted"}>{st.note}</p>}
                      </div>
                      {id ? (
                        <Link href={`/app/basket/${id}`} className="press inline-flex items-center gap-1 text-[14px] font-semibold text-up">
                          <Check size={16} /> Live
                        </Link>
                      ) : (
                        <Button size="md" className="h-9 px-4 text-[14px]" loading={st?.state === "working"} disabled={all} onClick={() => void launch(b)}>
                          Launch
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

/** A 512px PNG cover: the basket's gradient, its ticker, and the stocks inside. */
async function coverImage(b: CuratedBasket): Promise<File> {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, b.colors[0]);
  g.addColorStop(1, b.colors[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // Soft rings for depth.
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 28;
  for (const r of [150, 230, 310]) {
    ctx.beginPath();
    ctx.arc(size * 0.78, size * 0.2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  await document.fonts?.ready;
  const display = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "system-ui";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${b.ticker.length > 4 ? 112 : 136}px ${display}, system-ui, sans-serif`;
  ctx.fillText(b.ticker, size / 2, size * 0.46);
  ctx.font = `600 30px ${display}, system-ui, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText(b.components.map((c) => c.ticker).join(" · "), size / 2, size * 0.66);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((x) => (x ? res(x) : rej(new Error("Couldn't draw the cover"))), "image/png"));
  return new File([blob], `${b.ticker}.png`, { type: "image/png" });
}

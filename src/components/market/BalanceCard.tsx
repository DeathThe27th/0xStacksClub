"use client";

import { ArrowDownToLine } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Bar } from "@/components/ui/Skeleton";
import { usd } from "@/lib/format";
import { usePortfolio } from "@/lib/client/queries";
import { useActiveWallet } from "@/lib/client/wallet";

/**
 * Phone Home balance as a bento: a card-shaped blue balance tile, then small tiles for cash,
 * today's movers and Deposit. Every number is live.
 */
export function BalanceBento({ onDeposit }: { onDeposit: () => void }) {
  const p = usePortfolio({ poll: 20_000 });
  const wallet = useActiveWallet();
  const d = p.data;
  const change = d?.change24hUsd ?? 0;
  const moves = (d?.holdings ?? []).filter((h) => h.change24h !== null).map((h) => h.change24h!);
  const up = moves.filter((m) => m >= 0).length;
  const addr = wallet?.address ?? "";

  return (
    <section className="mt-4 space-y-3 px-gutter">
      {/* Card-shaped balance tile (credit-card proportions, 1.586:1) */}
      <div className="relative aspect-[1.586/1] w-full overflow-hidden rounded-[24px] bg-primary p-5 text-white shadow-[0_18px_40px_-18px_rgb(var(--primary)/0.7)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage: "repeating-linear-gradient(45deg, rgb(255 255 255 / 0.55) 0px 1px, transparent 1px 10px)",
            maskImage: "radial-gradient(ellipse 85% 70% at 100% 0%, #000 55%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(ellipse 85% 70% at 100% 0%, #000 55%, transparent 100%)",
          }}
        />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-center justify-between">
            <Wordmark size={16} />
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">BNB Chain</span>
          </div>
          <div>
            <p className="text-[13px] font-medium text-white/70">Balance</p>
            {p.isLoading ? (
              <Bar className="mt-2 h-10 w-40 bg-white/20" />
            ) : (
              <p className="mt-1 text-balance tnum" aria-label={`Balance ${usd(d?.totalUsd ?? null)}`}>
                {d?.totalUsd == null ? (
                  "—"
                ) : (
                  <AnimatedNumber
                    value={d.totalUsd}
                    format={(n) => {
                      const [a, b] = usd(n).split(".");
                      return (
                        <>
                          {a}
                          <span className="text-white/50">.{b}</span>
                        </>
                      );
                    }}
                  />
                )}
              </p>
            )}
          </div>
          <div className="flex items-end justify-between">
            <p className="text-[14px] font-medium tnum">
              <span>{usd(change, { sign: true })}</span>{" "}
              <span className="text-white/60">24h</span>
            </p>
            <p className="font-mono text-[13px] tracking-[0.12em] text-white/70">{addr ? `${addr.slice(0, 4)} •••• ${addr.slice(-4)}` : ""}</p>
          </div>
        </div>
      </div>

      {/* Small tiles */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[20px] border border-border bg-surface p-3.5">
          <p className="text-[17px] font-semibold leading-none tnum">{d ? d.usdt.display.toFixed(2) : "—"}</p>
          <p className="mt-1.5 text-[12px] text-text-muted">USDT cash</p>
        </div>
        <div className="rounded-[20px] border border-border bg-surface p-3.5">
          <p className="text-[17px] font-semibold leading-none tnum">
            {moves.length ? (
              <>
                <span className="text-up">{up}</span>
                <span className="text-text-dim">/</span>
                <span className="text-down">{moves.length - up}</span>
              </>
            ) : (
              "—"
            )}
          </p>
          <p className="mt-1.5 text-[12px] text-text-muted">Up / down today</p>
        </div>
        <button onClick={onDeposit} className="press flex flex-col justify-between rounded-[20px] bg-surface-2 p-3.5 text-left hover:bg-border/60">
          <ArrowDownToLine size={18} className="text-link" />
          <span className="mt-1.5 text-[14px] font-semibold">Deposit</span>
        </button>
      </div>
    </section>
  );
}

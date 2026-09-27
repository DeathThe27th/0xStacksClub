"use client";

import Link from "next/link";
import { Change } from "@/components/ui/Change";
import { price, units, usd } from "@/lib/format";
import type { Holding, Position } from "@/lib/client/types";

/** Right-pane card: what you hold in this stock or Stack. */
export function PositionCard({ holding, positions }: { holding?: Holding | null; positions?: Position[] }) {
  if (!holding && !positions?.length) return null;
  return (
    <section className="mt-4 hidden rounded-card border border-border bg-surface p-5 lg:block">
      <h3 className="text-[15px] font-semibold">Your position</h3>
      {holding && (
        <dl className="mt-3 space-y-2 text-[14px]">
          <Row k="Value" v={<span className="font-semibold">{usd(holding.valueUsd)}</span>} />
          <Row k="Holding" v={`${units(holding.unitsDisplay, 6)} ${holding.symbol}`} />
          <Row k="Avg. entry" v={price(holding.avgEntryUsd)} />
          <Row k="P&L" v={<Change value={holding.pnlPct} amount={holding.pnlUsd} />} />
        </dl>
      )}
      {positions?.map((p) => (
        <Link key={p.id} href={`/app/position/${p.id}`} className="mt-3 flex items-center justify-between rounded-chip bg-surface-2 px-3 py-2.5 hover:bg-border/60">
          <span className="text-[14px] font-medium">Position #{p.id}</span>
          <span className="text-right">
            <span className="block text-[14px] font-semibold tnum">{usd(p.valueUsd)}</span>
            <Change value={p.pnlPct} className="justify-end" />
          </span>
        </Link>
      ))}
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-text-muted">{k}</dt>
      <dd className="text-right tnum">{v}</dd>
    </div>
  );
}

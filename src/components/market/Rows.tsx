"use client";

import Link from "next/link";
import { useFlash } from "@/components/ui/AnimatedNumber";
import { AvatarStack } from "@/components/ui/Avatar";
import { Change } from "@/components/ui/Change";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { cn } from "@/lib/cn";
import { compact, price as fmtPrice, usd } from "@/lib/format";
import type { AssetItem, StackSummary } from "@/lib/client/types";

const num = (v: string | null | undefined) => (v === null || v === undefined ? null : Number(v));

/** 64px list row (UI_SPEC §3.6). No dividers; rows sit on bg. */
export function AssetRow({ a, wide = false }: { a: AssetItem; wide?: boolean }) {
  const p = num(a.price?.price_usd);
  const ch = num(a.price?.change_24h);
  const flash = useFlash(p);
  const cap = num(a.price?.market_cap);
  return (
    <Link href={`/app/stock/${a.provider}/${a.address}`} className="press -mx-2 flex h-row items-center gap-3 rounded-card px-2 hover:bg-surface/60">
      <TokenLogo src={a.logo_url} label={a.ticker} size={48} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center text-row font-semibold uppercase">
          <span className="truncate">{a.ticker}</span>
          {a.friends && <AvatarStack people={a.friends.avatars} extra={a.friends.count - a.friends.avatars.length} />}
        </p>
        <p className="mt-0.5 truncate text-secondary text-text-muted">
          {wide ? a.name : cap ? `$${compact(cap)} MC` : a.name}
        </p>
      </div>
      {wide && (
      <>
      <div className="w-[110px] text-right">
        <p className="text-[15px] tnum">{cap ? `$${compact(cap)}` : "—"}</p>
        <p className="text-[12px] text-text-muted">Market cap</p>
      </div>
      <div className="w-[110px] text-right">
        <p className="text-[15px] tnum">{num(a.price?.volume_24h) ? `$${compact(num(a.price?.volume_24h)!)}` : "—"}</p>
        <p className="text-[12px] text-text-muted">24h volume</p>
      </div>
      </>
      )}
      <div className={cn("rounded-md px-1 text-right", wide && "w-[120px]", flash)}>
        <p className="text-row font-medium tnum">{fmtPrice(p)}</p>
        <Change value={ch} className="mt-0.5 justify-end" />
      </div>
    </Link>
  );
}

export function BasketRow({ s }: { s: StackSummary }) {
  const flash = useFlash(s.valueHeldUsd);
  // 24h move when there's a point a day back, else 7d. Never the since-launch number here.
  const move = s.change24h !== null ? { value: s.change24h, label: " 24h" } : { value: s.change7d, label: " 7d" };
  return (
    <Link href={`/app/basket/${s.id}`} className="press -mx-2 flex h-row items-center gap-3 rounded-card px-2 hover:bg-surface/60">
      <TokenLogo src={s.image_url} label={s.ticker} size={48} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center text-row font-semibold uppercase">
          <span className="truncate">{s.ticker}</span>
          {s.friends && <AvatarStack people={s.friends.avatars} extra={s.friends.count - s.friends.avatars.length} />}
        </p>
        <p className="mt-0.5 truncate text-secondary text-text-muted">
          by @{s.creator?.username ?? `${s.creator_address.slice(0, 6)}…`} · {s.components.length} {s.components.length === 1 ? "stock" : "stocks"}
        </p>
      </div>
      <div className={cn("rounded-md px-1 text-right", flash)}>
        <p className="text-row font-medium tnum" title="Total value held in this basket">
          {usd(s.valueHeldUsd, { compact: (s.valueHeldUsd ?? 0) >= 10_000 })}
          <span className="ml-1 text-secondary font-normal text-text-muted">held</span>
        </p>
        <Change value={move.value} suffix={move.value === null ? undefined : move.label} className="mt-0.5 justify-end" />
      </div>
    </Link>
  );
}

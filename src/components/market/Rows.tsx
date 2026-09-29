"use client";

import Link from "next/link";
import { useFlash } from "@/components/ui/AnimatedNumber";
import { AvatarStack } from "@/components/ui/Avatar";
import { Change, Triangle } from "@/components/ui/Change";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { cn } from "@/lib/cn";
import { compact, pct, price as fmtPrice } from "@/lib/format";
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

/**
 * Basket row: cover, the stocks inside it, and its 24h move (value-weighted from its stocks). A
 * basket has no price of its own, so no price column.
 */
export function BasketRow({ s }: { s: StackSummary }) {
  const move = s.change24h !== null ? { value: s.change24h, label: "24h" } : { value: s.change7d, label: "7d" };
  const flash = useFlash(move.value);
  const shown = s.components.slice(0, 3);
  const logos = s.componentLogos ?? [];
  return (
    <Link href={`/app/basket/${s.id}`} className="press -mx-2 flex h-row items-center gap-3 rounded-card px-2 hover:bg-surface/60">
      <TokenLogo src={s.image_url} label={s.ticker} size={48} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-row font-semibold">
          <span className="truncate">{s.name}</span>
          {s.friends && <AvatarStack people={s.friends.avatars} extra={s.friends.count - s.friends.avatars.length} />}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="flex shrink-0 -space-x-1.5">
            {s.components.map((c, i) => (
              <span key={c.address} className="rounded-full ring-2 ring-bg">
                <TokenLogo src={logos[i] ?? null} label={c.ticker} size={16} />
              </span>
            ))}
          </span>
          <span className="truncate text-[13px] text-text-muted">
            {shown.map((c) => c.ticker).join(" · ")}
            {s.components.length > shown.length && ` +${s.components.length - shown.length}`}
          </span>
        </div>
      </div>
      <div className={cn("shrink-0 rounded-md px-1 text-right", flash)}>
        {move.value === null ? (
          <p className="text-row text-text-muted">—</p>
        ) : (
          <p className={cn("inline-flex items-center gap-1 text-row font-semibold tnum", move.value >= 0 ? "text-up" : "text-down")}>
            <Triangle up={move.value >= 0} />
            {pct(move.value)}
          </p>
        )}
        {move.value !== null && <p className="mt-0.5 text-[12px] text-text-muted">{move.label}</p>}
      </div>
    </Link>
  );
}

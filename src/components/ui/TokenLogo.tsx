/* eslint-disable @next/next/no-img-element */
"use client";

import { Blocks, Cloud, Cpu, Crown, Earth, MemoryStick, Rocket, Zap, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { curatedBasket, type CuratedBasket } from "@/lib/baskets";
import { cn } from "@/lib/cn";

const BASKET_ICONS: Record<CuratedBasket["icon"], LucideIcon> = {
  cpu: Cpu,
  memory: MemoryStick,
  earth: Earth,
  cloud: Cloud,
  zap: Zap,
  crown: Crown,
  blocks: Blocks,
  rocket: Rocket,
};

/**
 * Round provider token logo (or basket image), with a ticker fallback. Pass `basket` (the basket's
 * ticker) for basket logos: curated baskets render their badge instead of the stored cover.
 */
export function TokenLogo({ src, label, size = 48, className, basket }: { src?: string | null; label: string; size?: number; className?: string; basket?: string | null }) {
  const [broken, setBroken] = useState(false);
  const curated = basket ? curatedBasket(basket) : undefined;
  if (curated) return <BasketBadge b={curated} size={size} className={className} />;
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className={cn("shrink-0 rounded-full bg-surface object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full border border-border bg-surface font-semibold text-text-muted", className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.26) }}
    >
      {label.slice(0, 4)}
    </span>
  );
}

/** Gradient badge with the basket's glyph, lit from the top left. */
function BasketBadge({ b, size, className }: { b: CuratedBasket; size: number; className?: string }) {
  const Icon = BASKET_ICONS[b.icon];
  return (
    <span
      aria-hidden
      className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-full text-white", className)}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(120% 120% at 25% 15%, ${b.colors[0]} 0%, ${b.colors[0]} 22%, ${b.colors[1]} 100%)`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), inset 0 0 0 1px rgba(255,255,255,0.1)",
      }}
    >
      <span className="absolute inset-0" style={{ background: "radial-gradient(60% 45% at 30% 10%, rgba(255,255,255,0.35), transparent 70%)" }} />
      <Icon size={Math.round(size * 0.5)} strokeWidth={size >= 40 ? 1.75 : 2.25} className="relative drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]" />
    </span>
  );
}

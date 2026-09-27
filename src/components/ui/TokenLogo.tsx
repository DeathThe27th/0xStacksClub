/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/** Round provider token logo (or Stack image), with a ticker fallback. */
export function TokenLogo({ src, label, size = 48, className }: { src?: string | null; label: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
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

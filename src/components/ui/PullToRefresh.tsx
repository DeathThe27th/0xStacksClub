"use client";

import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";

/** Pull down at the top of the page to refresh (UI_SPEC §9). */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown>; children: React.ReactNode }) {
  const start = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const threshold = 72;

  return (
    <div
      onTouchStart={(e) => {
        if (window.scrollY <= 0 && !busy) start.current = e.touches[0]!.clientY;
      }}
      onTouchMove={(e) => {
        if (start.current === null) return;
        const d = e.touches[0]!.clientY - start.current;
        setPull(d > 0 ? Math.min(110, d * 0.5) : 0);
      }}
      onTouchEnd={async () => {
        const trigger = pull >= threshold * 0.8;
        start.current = null;
        setPull(0);
        if (trigger) {
          setBusy(true);
          await onRefresh().catch(() => undefined);
          setBusy(false);
        }
      }}
    >
      <div className="flex justify-center overflow-hidden transition-[height] duration-150" style={{ height: busy ? 40 : pull * 0.6 }} aria-hidden={!busy}>
        <Loader2 size={20} className={busy ? "mt-2 animate-spin text-text-muted" : "mt-2 text-text-muted"} style={{ transform: busy ? undefined : `rotate(${pull * 3}deg)` }} />
      </div>
      {children}
    </div>
  );
}

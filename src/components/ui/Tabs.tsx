"use client";

import { motion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/cn";

export type Tab<T extends string> = { id: T; label: React.ReactNode; badge?: string };

/** Market tabs (UI_SPEC §3.4): white active with a 2px primary underline over a 1px border track. */
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: Tab<T>[]; value: T; onChange: (v: T) => void; className?: string }) {
  const id = useId();
  return (
    <div role="tablist" className={cn("rb-seg relative flex border-b border-border", className)}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative flex h-12 flex-1 items-center justify-center gap-1.5 text-tab transition-colors",
              active ? "font-semibold text-text" : "font-medium text-text-muted hover:text-text",
            )}
          >
            {t.label}
            {t.badge && <span className="rounded-badge bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-on-primary">{t.badge}</span>}
            {active && <motion.span layoutId={`tab-${id}`} className="rb-seg-line absolute inset-x-0 -bottom-px h-0.5 bg-primary" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          </button>
        );
      })}
    </div>
  );
}

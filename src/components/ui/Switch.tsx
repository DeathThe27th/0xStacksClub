"use client";

import { cn } from "@/lib/cn";

/** iOS-style switch. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn("relative h-8 w-[52px] rounded-full transition-colors", checked ? "bg-up" : "bg-surface-2")}>
      <span className={cn("absolute left-0.5 top-0.5 h-7 w-7 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.35)] transition-transform", checked && "translate-x-5")} />
    </button>
  );
}

"use client";

import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

/** Filter row (UI_SPEC §3.5): square filter button then scrollable 40px chips, 8px gap. */
export function Chips<T extends string>({
  chips,
  value,
  onChange,
  onFilter,
}: {
  chips: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  onFilter?: () => void;
}) {
  return (
    <div className="no-scrollbar -mx-gutter flex gap-2 overflow-x-auto px-gutter py-3">
      {onFilter && (
        <button onClick={onFilter} aria-label="Sort" className="press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-surface text-text-muted hover:text-text">
          <SlidersHorizontal size={18} />
        </button>
      )}
      {chips.map((c) => {
        const active = c.id === value;
        return (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            aria-pressed={active}
            className={cn(
              "press h-10 shrink-0 whitespace-nowrap rounded-full border px-4 text-chip transition-colors",
              active ? "pop-soft border-border bg-surface-2 font-semibold text-text" : "border-border bg-surface text-text-muted hover:text-text",
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

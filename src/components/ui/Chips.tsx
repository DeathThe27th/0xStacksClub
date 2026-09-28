"use client";

import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

/** Filter row (UI_SPEC §3.5): square filter button then scrollable 40px chips, 8px gap. */
export function Chips<T extends string>({
  chips,
  value,
  onChange,
  onFilter,
  filterActive,
}: {
  chips: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  onFilter?: () => void;
  /** Marks the filter button when a sheet-only filter or sort is applied. */
  filterActive?: boolean;
}) {
  return (
    <div className="no-scrollbar -mx-gutter flex gap-2 overflow-x-auto px-gutter py-3">
      {onFilter && (
        <button
          onClick={onFilter}
          aria-label={filterActive ? "Filter (active)" : "Filter"}
          className={cn(
            "press relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-surface hover:text-text",
            filterActive ? "text-text" : "text-text-muted",
          )}
        >
          <SlidersHorizontal size={18} />
          {filterActive && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />}
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
              active ? "border-border bg-surface-2 font-semibold text-text" : "border-border bg-surface text-text-muted hover:text-text",
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

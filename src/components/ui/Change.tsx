import { cn } from "@/lib/cn";
import { pct, usd } from "@/lib/format";

/** Small filled triangle, drawn (not a glyph), pointing up or down. */
export function Triangle({ up, className }: { up: boolean; className?: string }) {
  return (
    <svg width="8" height="7" viewBox="0 0 8 7" aria-hidden className={cn("shrink-0", className)}>
      <path d={up ? "M4 0.5 7.6 6.5H0.4Z" : "M4 6.5 0.4 0.5H7.6Z"} fill="currentColor" />
    </svg>
  );
}

/** Percent change, 13/500 with a triangle, in up or down (UI_SPEC §1). */
export function Change({ value, amount, className, suffix }: { value: number | null | undefined; amount?: number | null; className?: string; suffix?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className={cn("text-change text-text-muted", className)}>—</span>;
  const up = value >= 0;
  return (
    <span className={cn("inline-flex items-center gap-1 text-change tnum", up ? "text-up" : "text-down", className)}>
      <Triangle up={up} />
      {amount !== undefined && amount !== null ? `${usd(Math.abs(amount))} (${pct(value)})` : pct(value)}
      {suffix && <span className="text-text-muted">{suffix}</span>}
    </span>
  );
}

"use client";

import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { CandlestickChart } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export type Point = { t: number; value: number; o?: number; h?: number; l?: number; c?: number; reference?: number | null };
export type Timeframe = "LIVE" | "1H" | "1D" | "1W" | "ALL";

const UP = "#22C55E";
const DOWN = "#FF4430";
const MUTED = "#8B8B9A";

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/**
 * Full-bleed 320px chart (UI_SPEC §4.3): no grid, no left axis, right-edge labels, 2px line in
 * up/down with a 25%→0 gradient, dashed current-price line with a pill label. Press-and-drag
 * scrubs; time labels appear only while scrubbing.
 */
export function PriceChart({
  points,
  mode,
  up,
  onScrub,
  formatPrice,
  showReference,
}: {
  points: Point[];
  mode: "area" | "candles";
  up: boolean;
  onScrub: (p: Point | null) => void;
  formatPrice: (n: number) => string;
  showReference?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | ISeriesApi<"Candlestick"> | null>(null);
  const ref = useRef<ISeriesApi<"Line"> | null>(null);
  const line = useRef<IPriceLine | null>(null);
  const byTime = useRef(new Map<number, Point>());
  const scrubCb = useRef(onScrub);
  scrubCb.current = onScrub;
  const fmt = useRef(formatPrice);
  fmt.current = formatPrice;

  // Create once
  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: MUTED, fontSize: 11, fontFamily: "var(--font-inter), system-ui", attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      leftPriceScale: { visible: false },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderVisible: false, visible: false, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: "rgba(255,255,255,0.35)", width: 1, style: LineStyle.Solid, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      handleScroll: false,
      handleScale: false,
      localization: { priceFormatter: (n: number) => fmt.current(n) },
    });
    chart.current = c;
    let scrubbing = false;
    c.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        if (scrubbing) {
          scrubbing = false;
          c.timeScale().applyOptions({ visible: false });
        }
        scrubCb.current(null);
        return;
      }
      if (!scrubbing) {
        scrubbing = true;
        c.timeScale().applyOptions({ visible: true });
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(5);
      }
      scrubCb.current(byTime.current.get(Number(param.time)) ?? null);
    });
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
      ref.current = null;
      line.current = null;
    };
  }, []);

  // Series type and colors
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    if (series.current) {
      c.removeSeries(series.current);
      series.current = null;
      line.current = null;
    }
    const color = up ? UP : DOWN;
    series.current =
      mode === "area"
        ? c.addSeries(AreaSeries, {
            lineColor: color,
            lineWidth: 2,
            topColor: hexA(color, 0.25),
            bottomColor: hexA(color, 0),
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerRadius: 4,
            crosshairMarkerBorderColor: "#0A0A12",
            crosshairMarkerBackgroundColor: color,
          })
        : c.addSeries(CandlestickSeries, {
            upColor: UP,
            downColor: DOWN,
            borderVisible: false,
            wickUpColor: UP,
            wickDownColor: DOWN,
            priceLineVisible: false,
            lastValueVisible: false,
          });
  }, [mode, up]);

  // Faint dashed reference-index line (Stack charts)
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    if (showReference && !ref.current) {
      ref.current = c.addSeries(LineSeries, {
        color: "rgba(139,139,154,0.55)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
    } else if (!showReference && ref.current) {
      c.removeSeries(ref.current);
      ref.current = null;
    }
  }, [showReference]);

  // Data
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    const dedup = new Map<number, Point>();
    for (const p of points) dedup.set(Math.floor(p.t / 1000), p);
    const sorted = [...dedup.entries()].sort((a, b) => a[0] - b[0]);
    byTime.current = new Map(sorted.map(([t, p]) => [t, p]));
    if (mode === "area") {
      (s as ISeriesApi<"Area">).setData(sorted.map(([t, p]) => ({ time: t as UTCTimestamp, value: p.value })));
    } else {
      (s as ISeriesApi<"Candlestick">).setData(
        sorted.map(([t, p]) => ({ time: t as UTCTimestamp, open: p.o ?? p.value, high: p.h ?? p.value, low: p.l ?? p.value, close: p.c ?? p.value })),
      );
    }
    ref.current?.setData(sorted.filter(([, p]) => p.reference != null).map(([t, p]) => ({ time: t as UTCTimestamp, value: p.reference! })));
    const last = sorted.at(-1)?.[1];
    const color = up ? UP : DOWN;
    if (line.current) s.removePriceLine(line.current);
    line.current = last
      ? s.createPriceLine({ price: last.value, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, axisLabelColor: color, axisLabelTextColor: "#FFFFFF", title: "" })
      : null;
    chart.current?.timeScale().fitContent();
  }, [points, mode, up]);

  return <div ref={el} className="h-[320px] w-full touch-pan-y select-none lg:h-[420px]" />;
}

/** Controls row under the chart (UI_SPEC §4.3), right-aligned. */
export function ChartControls({
  value,
  onChange,
  mode,
  onMode,
  timeframes = ["LIVE", "1H", "1D", "1W", "ALL"],
}: {
  value: Timeframe;
  onChange: (t: Timeframe) => void;
  mode?: "area" | "candles";
  onMode?: (m: "area" | "candles") => void;
  timeframes?: Timeframe[];
}) {
  return (
    <div className="flex items-center justify-end gap-1 px-gutter pt-2 lg:px-0">
      {timeframes.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          aria-pressed={value === t}
          className={cn("press flex h-9 items-center gap-1.5 rounded-chip px-3 text-[13px] font-semibold", value === t ? "bg-surface-2 text-text" : "text-text-muted hover:text-text")}
        >
          {t}
          {t === "LIVE" && <span className="h-1.5 w-1.5 animate-live-dot rounded-full bg-down" />}
        </button>
      ))}
      {onMode && (
        <button
          onClick={() => onMode(mode === "area" ? "candles" : "area")}
          aria-label={mode === "area" ? "Show candles" : "Show area"}
          aria-pressed={mode === "candles"}
          className={cn("press grid h-9 w-9 place-items-center rounded-chip", mode === "candles" ? "bg-surface-2 text-text" : "text-text-muted hover:text-text")}
        >
          <CandlestickChart size={18} />
        </button>
      )}
    </div>
  );
}

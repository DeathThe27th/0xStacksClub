"use client";

import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesMarkersPluginApi,
  type Time,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { CandlestickChart } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { cssColor, useTheme } from "@/lib/client/theme";

export type Point = { t: number; value: number; o?: number; h?: number; l?: number; c?: number; reference?: number | null };
export type Timeframe = "LIVE" | "1H" | "1D" | "1W" | "ALL";
/** A StacksClub user's trade, drawn on the chart (buys below the bar, sells above). */
export type TradeMarker = { t: number; side: "buy" | "sell"; label: string };

/** Chart colours come from the theme tokens, so the canvas follows light and dark mode. */
function palette() {
  return {
    up: cssColor("up"),
    down: cssColor("down"),
    muted: cssColor("text-muted"),
    text: cssColor("text"),
    bg: cssColor("bg"),
    crosshair: cssColor("text", 0.35),
    reference: cssColor("text-muted", 0.55),
    fill: (token: "up" | "down", a: number) => cssColor(token, a),
  };
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
  markers,
}: {
  points: Point[];
  mode: "area" | "candles";
  up: boolean;
  onScrub: (p: Point | null) => void;
  formatPrice: (n: number) => string;
  showReference?: boolean;
  markers?: TradeMarker[];
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | ISeriesApi<"Candlestick"> | null>(null);
  const ref = useRef<ISeriesApi<"Line"> | null>(null);
  const line = useRef<IPriceLine | null>(null);
  const markerApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const byTime = useRef(new Map<number, Point>());
  const scrubCb = useRef(onScrub);
  scrubCb.current = onScrub;
  const fmt = useRef(formatPrice);
  fmt.current = formatPrice;
  const { resolved: theme } = useTheme();

  // Create once
  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: palette().muted, fontSize: 11, fontFamily: "var(--font-inter), system-ui", attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      leftPriceScale: { visible: false },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderVisible: false, visible: false, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: palette().crosshair, width: 1, style: LineStyle.Solid, labelVisible: false },
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

  // Theme change: axis text and crosshair
  useEffect(() => {
    const p = palette();
    chart.current?.applyOptions({ layout: { textColor: p.muted }, crosshair: { vertLine: { color: p.crosshair } } });
  }, [theme]);

  // Series type and colors
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    if (series.current) {
      markerApi.current?.detach();
      markerApi.current = null;
      c.removeSeries(series.current);
      series.current = null;
      line.current = null;
    }
    const p = palette();
    const color = up ? p.up : p.down;
    series.current =
      mode === "area"
        ? c.addSeries(AreaSeries, {
            lineColor: color,
            lineWidth: 2,
            topColor: p.fill(up ? "up" : "down", 0.25),
            bottomColor: p.fill(up ? "up" : "down", 0),
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerRadius: 4,
            crosshairMarkerBorderColor: p.bg,
            crosshairMarkerBackgroundColor: color,
          })
        : c.addSeries(CandlestickSeries, {
            upColor: p.up,
            downColor: p.down,
            borderVisible: false,
            wickUpColor: p.up,
            wickDownColor: p.down,
            priceLineVisible: false,
            lastValueVisible: false,
          });
  }, [mode, up, theme]);

  // Faint dashed reference-index line (Stack charts)
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    if (showReference && !ref.current) {
      ref.current = c.addSeries(LineSeries, {
        color: palette().reference,
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
    const color = up ? palette().up : palette().down;
    if (line.current) s.removePriceLine(line.current);
    line.current = last
      ? s.createPriceLine({ price: last.value, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, axisLabelColor: color, axisLabelTextColor: "#FFFFFF", title: "" })
      : null;
    chart.current?.timeScale().fitContent();
  }, [points, mode, up, theme]);

  // Trade markers, snapped to the candle they fall in (markers must sit on an existing bar).
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    const times = [...byTime.current.keys()];
    const first = times[0];
    const p = palette();
    const list = (markers ?? [])
      .map((m) => {
        const sec = Math.floor(m.t / 1000);
        if (first === undefined || sec < first) return null;
        let snap = first;
        for (const t of times) {
          if (t <= sec) snap = t;
          else break;
        }
        return {
          time: snap as UTCTimestamp,
          position: m.side === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
          shape: m.side === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
          color: m.side === "buy" ? p.up : p.down,
          text: m.label,
          size: 1,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => a.time - b.time);
    if (!markerApi.current) markerApi.current = createSeriesMarkers(s, list);
    else markerApi.current.setMarkers(list);
  }, [markers, points, mode, up, theme]);

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

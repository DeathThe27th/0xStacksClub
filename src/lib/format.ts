// Display formatting only. Never feed these back into amounts sent onchain.

export function usd(n: number | null | undefined, opts: { sign?: boolean; compact?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = opts.sign ? (n > 0 ? "+" : n < 0 ? "-" : "") : n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (opts.compact) return `${sign}$${compact(a)}`;
  return `${sign}$${a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Prices: under $1 show up to 6 significant digits (UI_SPEC §3.6). */
export function price(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n < 1) return `$${n.toPrecision(6).replace(/0+$/, "").replace(/\.$/, "")}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function compact(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

export function pct(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

/** Stack index: a number like 1,042.18, never with $ (FLOWS §6). */
export function indexValue(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function units(display: string, maxDecimals = 6): string {
  const [i, f = ""] = display.split(".");
  const trimmed = f.slice(0, maxDecimals).replace(/0+$/, "");
  return `${Number(i).toLocaleString("en-US")}${trimmed ? `.${trimmed}` : ""}`;
}

export function timeAgo(iso: string | number): string {
  const t = typeof iso === "number" ? iso : new Date(iso).getTime();
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

/** Raw USDT units (18 decimals on BSC) to number for display. Decimals passed in, never assumed. */
export function rawToNumber(raw: string | bigint, decimals: number): number {
  const v = typeof raw === "bigint" ? raw : BigInt(raw);
  const base = 10n ** BigInt(decimals);
  return Number(v / base) + Number(v % base) / Number(base);
}

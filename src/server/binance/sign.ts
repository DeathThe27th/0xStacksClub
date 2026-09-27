import { createHmac } from "node:crypto";

/** Base path every Binance Web3 request carries, on the wire and in the signed path. */
export const BUILD_PREFIX = "/build";
export const BINANCE_ORIGIN = "https://web3.binance.com";

export type QueryValue = string | number | boolean | undefined | null;

/**
 * Raw query string in insertion order, `encodeURIComponent` per key and value, which is exactly
 * what goes on the wire and into the signature (docs/binance-notes.md §2).
 */
export function buildQuery(query: Record<string, QueryValue> = {}): string {
  return Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

/** `/build` + path + `?query`. `path` is `/api/v1/...` without the prefix. */
export function requestPath(path: string, query?: Record<string, QueryValue>): string {
  if (!path.startsWith("/api/")) throw new Error(`Binance path must start with /api/: ${path}`);
  const qs = buildQuery(query);
  return `${BUILD_PREFIX}${path}${qs ? `?${qs}` : ""}`;
}

export function preHash(timestamp: string, method: string, signedPath: string, body: string): string {
  return `${timestamp}${method.toUpperCase()}${signedPath}${body}`;
}

/** Base64(HMAC-SHA256(secret, preHash)), UTF-8. */
export function signPreHash(secret: string, pre: string): string {
  return createHmac("sha256", secret).update(pre, "utf8").digest("base64");
}

export function signedHeaders(opts: {
  apiKey: string;
  secret: string;
  method: string;
  signedPath: string;
  body: string;
  now?: Date;
}): Record<string, string> {
  const timestamp = (opts.now ?? new Date()).toISOString();
  const sign = signPreHash(opts.secret, preHash(timestamp, opts.method, opts.signedPath, opts.body));
  return {
    "X-OC-APIKEY": opts.apiKey,
    "X-OC-TIMESTAMP": timestamp,
    "X-OC-SIGN": sign,
  };
}

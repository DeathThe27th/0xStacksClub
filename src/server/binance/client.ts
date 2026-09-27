import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { BINANCE_ORIGIN, requestPath, signedHeaders, type QueryValue } from "./sign";

export class BinanceError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly httpStatus: number | null,
    readonly requestId: string | null,
    readonly path: string,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = "BinanceError";
  }
}

/** Response body did not match the schema in docs/binance-notes.md. Never silently coerced. */
export class BinanceSchemaError extends BinanceError {
  constructor(path: string, issues: z.core.$ZodIssue[], raw: unknown) {
    super(
      `Binance response for ${path} did not match the documented schema: ${issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
      null,
      null,
      null,
      path,
      raw,
    );
    this.name = "BinanceSchemaError";
  }
}

const envelope = z.object({
  code: z.number(),
  msg: z.string().nullish(),
  data: z.unknown(),
  timestamp: z.number().nullish(),
  success: z.boolean().nullish(),
});

type Options<T extends z.ZodType> = {
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  schema: T;
  /** Order submission sets this to false. Default true for GET, false otherwise. */
  retry?: boolean;
  timeoutMs?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Signed request to the Binance Web3 API. Validates the `OCResult` envelope and `data` with zod.
 * Retries once on 5xx or network error with jitter (re-signed, since signatures are single-use).
 */
export async function binanceFetch<T extends z.ZodType>(
  method: "GET" | "POST",
  path: string,
  opts: Options<T>,
): Promise<z.infer<T>> {
  const env = serverEnv();
  const signedPath = requestPath(path, opts.query);
  const body = opts.body ? JSON.stringify(opts.body) : "";
  const canRetry = opts.retry ?? method === "GET";

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BINANCE_ORIGIN}${signedPath}`, {
        method,
        headers: {
          ...signedHeaders({
            apiKey: env.BINANCE_WEB3_API_KEY,
            secret: env.BINANCE_WEB3_SECRET_KEY,
            method,
            signedPath,
            body,
          }),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body || undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      });
    } catch (err) {
      if (canRetry && attempt === 0) {
        await sleep(200 + Math.random() * 400);
        continue;
      }
      throw new BinanceError(`Network error calling ${path}: ${(err as Error).message}`, null, null, null, path);
    }

    const requestId = res.headers.get("x-oc-request-id") ?? res.headers.get("x-request-id");
    if (res.status >= 500 && canRetry && attempt === 0) {
      await sleep(200 + Math.random() * 400);
      continue;
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new BinanceError(
        `Non-JSON response from ${path} (HTTP ${res.status}): ${text.slice(0, 200)}`,
        null,
        res.status,
        requestId,
        path,
      );
    }

    const env_ = envelope.safeParse(json);
    if (!env_.success) throw new BinanceSchemaError(path, env_.error.issues, json);
    if (env_.data.code !== 0) {
      throw new BinanceError(env_.data.msg ?? "Binance error", env_.data.code, res.status, requestId, path, json);
    }

    const data = opts.schema.safeParse(env_.data.data);
    if (!data.success) {
      console.error("[binance] schema mismatch", path, data.error.issues);
      throw new BinanceSchemaError(path, data.error.issues, env_.data.data);
    }
    return data.data;
  }
}

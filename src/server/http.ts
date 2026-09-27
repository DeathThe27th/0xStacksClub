import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError } from "@/server/auth";
import { BinanceError } from "@/server/binance";
import { DbError, db } from "@/server/db";
import { publicError } from "@/server/errors";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Wraps a route handler: consistent JSON errors, no stack traces or secrets to the client. */
export function handler<A extends unknown[]>(fn: (req: Request, ...args: A) => Promise<Response>) {
  return async (req: Request, ...args: A): Promise<Response> => {
    try {
      return await fn(req, ...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.code ?? "error", message: e.message }, { status: e.status });
      if (e instanceof AuthError) return NextResponse.json({ error: "auth", message: e.message }, { status: e.status });
      if (e instanceof z.ZodError) {
        return NextResponse.json(
          { error: "validation", message: e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") },
          { status: 400 },
        );
      }
      if (e instanceof BinanceError) return NextResponse.json(publicError(e), { status: 502 });
      if (e instanceof DbError) {
        console.error("[db]", e.message);
        return NextResponse.json({ error: "db", message: "Database error" }, { status: 500 });
      }
      return NextResponse.json(publicError(e), { status: 500 });
    }
  };
}

export async function readJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
  return schema.parse(body);
}

export function json(data: unknown, init?: ResponseInit & { cacheSeconds?: number }) {
  const headers = new Headers(init?.headers);
  if (init?.cacheSeconds) headers.set("Cache-Control", `public, s-maxage=${init.cacheSeconds}, stale-while-revalidate=${init.cacheSeconds * 5}`);
  return NextResponse.json(data, { ...init, headers });
}

/** Per-user token bucket in Postgres (take_token in the migration). */
export async function rateLimit(key: string, capacity = 20, perSeconds = 60) {
  const { data, error } = await db().rpc("take_token", { p_key: key, capacity, per_seconds: perSeconds });
  if (error) {
    console.error("[ratelimit]", error.message);
    return; // fail open on limiter errors; auth still applies
  }
  if (data === false) throw new HttpError(429, "Too many requests, slow down a little", "rate_limited");
}

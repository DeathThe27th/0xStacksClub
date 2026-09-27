import { NextResponse } from "next/server";
import { buildCatalog } from "@/server/assets/catalog";
import { upsertCatalog } from "@/server/assets/store";
import { isCronAuthorized } from "@/server/cron";
import { publicError } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Seeds the asset allowlist from the Binance RWA API. Runs on the server (a Binance-permitted
 * region) and is called by `pnpm seed:assets`, which writes the Foundry JSON files locally.
 * `?routes=0` skips the per-token quote probe.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const checkRoutes = new URL(req.url).searchParams.get("routes") !== "0";
  try {
    const catalog = await buildCatalog({ checkRoutes });
    const stored = await upsertCatalog(catalog.assets);
    return NextResponse.json({ ...catalog, stored });
  } catch (e) {
    return NextResponse.json(publicError(e), { status: 502 });
  }
}

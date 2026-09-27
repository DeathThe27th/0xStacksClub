import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/server/cron";
import { publicError } from "@/server/errors";
import { refreshPrices } from "@/server/prices";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every minute: refresh the price cache for all catalog assets. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await refreshPrices());
  } catch (e) {
    return NextResponse.json(publicError(e), { status: 500 });
  }
}

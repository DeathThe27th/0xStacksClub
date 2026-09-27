import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/server/cron";
import { publicError } from "@/server/errors";
import { syncRange, vaultAddress } from "@/server/vault";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every minute: index vault events since the last synced block. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!vaultAddress()) return NextResponse.json({ skipped: "vault not deployed" });
  try {
    const r = await syncRange();
    return NextResponse.json({ from: r.from.toString(), to: r.to.toString(), logs: r.logs });
  } catch (e) {
    return NextResponse.json(publicError(e), { status: 500 });
  }
}

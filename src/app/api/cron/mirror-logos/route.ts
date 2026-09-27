import { NextResponse } from "next/server";
import { mirrorLogos } from "@/server/assets/logos";
import { isCronAuthorized } from "@/server/cron";
import { publicError } from "@/server/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Copies token logos into Supabase Storage. Run after seed:assets; safe to rerun. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await mirrorLogos());
  } catch (e) {
    return NextResponse.json(publicError(e), { status: 500 });
  }
}

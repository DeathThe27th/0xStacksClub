import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/server/cron";
import { publicError } from "@/server/errors";
import { appendIndexPoints } from "@/server/stacks";

export const dynamic = "force-dynamic";

/** Every 5 minutes: append a point to each Stack's index series. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await appendIndexPoints());
  } catch (e) {
    return NextResponse.json(publicError(e), { status: 500 });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { isRestricted } from "@/lib/geo";

// Trading routes call Binance on the user's behalf, so they honour Binance's region list.
// Browsing stays open. /api/bot is deliberately not matched: those routes only read data and build
// links for the iMessage bot (shared-secret header), and a person who opens a link still reaches
// the trading routes below from their own IP.
export function middleware(req: NextRequest) {
  const country = req.headers.get("x-vercel-ip-country");
  const region = req.headers.get("x-vercel-ip-country-region");
  if (isRestricted(country, region)) {
    return NextResponse.json(
      { error: "region_restricted", message: "Trading isn't available in your region." },
      { status: 451 },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/quote", "/api/orders/:path*", "/api/intents/:path*"],
};

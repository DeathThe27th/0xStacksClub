"use client";

import { usePathname } from "next/navigation";
import { MarketPane } from "@/components/desktop/MarketPane";
import { TopBar } from "@/components/desktop/TopBar";
import { cn } from "@/lib/cn";
import { BottomNav } from "./BottomNav";
import { LiveNotifications } from "./LiveNotifications";
import { UnfinishedBanner } from "./UnfinishedBanner";

/**
 * Phone: a 430px column with the floating pill nav; detail pages hide it for a sticky CTA
 * (UI_SPEC §4.5). Desktop (lg): a top bar, and on market pages a persistent market list on the
 * left with the page in the centre (pages add their own right pane).
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const detail = /^\/app\/(stock|basket|position|club)\//.test(path) || path.startsWith("/app/create");
  const market = path === "/app" || /^\/app\/(stock|basket|club)\//.test(path);
  return (
    <div className="pt-safe lg:pt-0">
      <TopBar />
      <div className="lg:flex">
        {market && <MarketPane />}
        <main className={cn("mx-auto w-full max-w-app min-w-0 lg:max-w-none", market ? "lg:px-6" : "lg:max-w-[1180px] lg:px-8", detail ? "pb-cta lg:pb-10" : "pb-nav lg:pb-10")}>
          <UnfinishedBanner />
          {children}
        </main>
      </div>
      {!detail && <BottomNav />}
      <LiveNotifications />
    </div>
  );
}

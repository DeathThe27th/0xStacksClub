"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { BottomNav } from "./BottomNav";
import { LiveNotifications } from "./LiveNotifications";
import { Sidebar } from "./Sidebar";
import { UnfinishedBanner } from "./UnfinishedBanner";

/**
 * Mobile: a 430px column with the floating pill nav; detail pages hide it for a sticky CTA
 * (UI_SPEC §4.5). Desktop (lg): left sidebar, pages lay out their own columns.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const detail = /^\/app\/(stock|stack|position)\//.test(path) || path.startsWith("/app/create");
  return (
    <div className="pt-safe">
      <Sidebar />
      <div className="lg:pl-[240px]">
        <div className={cn("mx-auto max-w-app lg:max-w-[1240px] lg:px-8 lg:pb-12", detail ? "pb-cta lg:pb-12" : "pb-nav lg:pb-12")}>
          <UnfinishedBanner />
          {children}
        </div>
      </div>
      {!detail && <BottomNav />}
      <LiveNotifications />
    </div>
  );
}

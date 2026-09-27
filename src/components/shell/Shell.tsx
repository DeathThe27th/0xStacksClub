"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "./BottomNav";
import { LiveNotifications } from "./LiveNotifications";
import { UnfinishedBanner } from "./UnfinishedBanner";

/** Detail pages hide the nav and use a sticky CTA instead (UI_SPEC §4.5). */
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const detail = /^\/app\/(stock|stack|position)\//.test(path) || path.startsWith("/app/create");
  return (
    <div className="pt-safe">
      <UnfinishedBanner />
      <div className={detail ? "pb-cta" : "pb-nav"}>{children}</div>
      {!detail && <BottomNav />}
      <LiveNotifications />
    </div>
  );
}

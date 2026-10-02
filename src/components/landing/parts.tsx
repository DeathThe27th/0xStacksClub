"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { APP_NAME } from "@/lib/constants";

export type Start = { onStart: () => void; ready: boolean; opening: boolean };

export function StartButton({ start, className, small }: { start: Start; className?: string; small?: boolean }) {
  return (
    <button
      onClick={start.onStart}
      disabled={!start.ready}
      className={cn(
        "press inline-flex items-center justify-center gap-2 rounded-full bg-primary font-semibold text-on-primary transition-colors hover:bg-primary-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-progress",
        small ? "h-10 px-5 text-[15px]" : "h-14 px-8 text-[17px]",
        className,
      )}
    >
      {!start.ready && <Loader2 size={small ? 16 : 18} className="animate-spin" aria-hidden />}
      {start.opening ? `Opening ${APP_NAME}` : "Get started"}
    </button>
  );
}

/** Sections in page order, for the header, the pill nav and the footer. */
export const LINKS = [
  { href: "#text", label: "Text" },
  { href: "#stocks", label: "Stocks" },
  { href: "#hours", label: "Hours" },
  { href: "#baskets", label: "Baskets" },
];

/** A phone drawn in CSS: frame, island, screen. Height sets the size; width follows at 9:19.5. */
export function Phone({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "relative aspect-[9/19.5] rounded-[2.9rem] bg-[#111] p-[9px] shadow-[0_2px_4px_rgb(0_0_0/0.08),0_24px_48px_-12px_rgb(0_0_0/0.28),0_60px_120px_-40px_rgb(40_20_120/0.35),inset_0_0_0_1.5px_rgb(255_255_255/0.14)]",
        className,
      )}
    >
      <div className="relative h-full overflow-hidden rounded-[2.35rem]">
        <span aria-hidden className="absolute left-1/2 top-2.5 z-20 h-[22px] w-[84px] -translate-x-1/2 rounded-full bg-black" />
        {children}
      </div>
    </div>
  );
}

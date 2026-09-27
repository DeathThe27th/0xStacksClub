import { cn } from "@/lib/cn";

/**
 * Bento grid: 6 columns, 2 rows on wide screens, stacked on narrow ones. Adapted from a
 * stats-bento layout; tiles take real data only.
 */
export function BentoGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-6 md:grid-rows-[auto_auto]", className)}>{children}</div>;
}

/** Large brand tile with a faint diagonal hatch fading in from the top-right corner. */
export function BentoHero({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative flex flex-col justify-between overflow-hidden rounded-[24px] bg-primary p-8 text-white md:col-span-3 md:row-span-2", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage: "repeating-linear-gradient(45deg, rgb(255 255 255 / 0.55) 0px 1px, transparent 1px 10px)",
          maskImage: "radial-gradient(ellipse 80% 60% at 100% 0%, #000 60%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 100% 0%, #000 60%, transparent 100%)",
        }}
      />
      <div className="relative flex h-full flex-col justify-between gap-8">{children}</div>
    </div>
  );
}

export function BentoTile({ children, className, tone = "surface" }: { children: React.ReactNode; className?: string; tone?: "surface" | "surface-2" }) {
  return (
    <div className={cn("rounded-[24px] border border-border p-6", tone === "surface" ? "bg-surface" : "bg-surface-2", className)}>
      {children}
    </div>
  );
}

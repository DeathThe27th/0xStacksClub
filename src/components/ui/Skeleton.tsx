import { cn } from "@/lib/cn";

export function Bar({ className }: { className?: string }) {
  return (
    <span className={cn("relative block overflow-hidden rounded-md bg-surface", className)}>
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
    </span>
  );
}

/** Row skeleton: grey circle and two bars with a shimmer (UI_SPEC §9). */
export function RowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex h-row items-center gap-3">
          <Bar className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Bar className="h-4 w-20" />
            <Bar className="h-3 w-32" />
          </div>
          <div className="space-y-2">
            <Bar className="ml-auto h-4 w-16" />
            <Bar className="ml-auto h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { StepState } from "@/lib/client/runner";

export type ChecklistStep = { key: string; label: string; state: StepState; note?: string; error?: string };

/** Vertical step list: empty circle, spinner, green check, red x (UI_SPEC §6.4). */
export function Checklist({ steps }: { steps: ChecklistStep[] }) {
  return (
    <ol className="relative space-y-0">
      {steps.map((s, i) => (
        <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
          {i < steps.length - 1 && <span aria-hidden className={cn("absolute left-[13px] top-8 h-[calc(100%-28px)] w-px", s.state === "done" ? "bg-up/50" : "bg-border")} />}
          <span className="relative z-10 grid h-7 w-7 shrink-0 place-items-center">
            {s.state === "done" && (
              <span className="grid h-7 w-7 place-items-center rounded-full bg-up text-bg">
                <Check size={16} strokeWidth={3} />
              </span>
            )}
            {s.state === "active" && <Loader2 size={24} className="animate-spin text-link" />}
            {s.state === "failed" && (
              <span className="grid h-7 w-7 place-items-center rounded-full bg-down text-white">
                <X size={16} strokeWidth={3} />
              </span>
            )}
            {s.state === "idle" && <span className="h-6 w-6 rounded-full border-2 border-border" />}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className={cn("text-[16px]", s.state === "idle" ? "text-text-muted" : "font-medium text-text")}>
              {s.label}
              {s.note && s.state === "active" && <span className="ml-2 text-secondary text-text-muted">{s.note}…</span>}
            </p>
            {s.error && <p className="mt-1 text-secondary text-down">{s.error}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

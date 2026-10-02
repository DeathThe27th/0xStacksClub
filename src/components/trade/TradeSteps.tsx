"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { StepKey, StepState } from "@/lib/client/runner";

/** Trade steps use the runner's StepKeys; other flows (a card deposit) bring their own keys and lines. */
export type StepRow = { key: StepKey | (string & {}); label: string };
export type StepStatus = { state: StepState; note?: string; error?: string };

/** What an active step is doing right now, from the runner's own notes. */
function activeLine(key: string, note?: string): string {
  if (key.startsWith("leg-")) {
    if (note === "Sign order") return "Signing the order";
    if (note === "Settling") return "Waiting for the order to fill";
    if (note === "Swapping") return "Swapping on BNB Chain";
    if (note === "Approving") return "Approving the token for the swap";
    return "Getting the best price";
  }
  if (key === "fee" || key === "sellfee") return "Confirming on BNB Chain";
  if (key === "release") return "Releasing from your position";
  if (key === "approve") return "Approving each stock for the vault";
  if (key === "deposit") return "Depositing into your position";
  return note ?? "Working on it";
}

function secs(ms: number) {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/**
 * A trade's steps as a vertical line of nodes: each fills in as the chain confirms it, the active
 * one says what it's doing and for how long, and the connector below a finished step fills too.
 * Times are measured here, from when a step was seen starting; steps already done when the sheet
 * opened (a resumed trade) just say Done.
 */
export function TradeSteps({ steps, states }: { steps: StepRow[]; states: Partial<Record<string, StepStatus>> }) {
  const [times, setTimes] = useState<Partial<Record<string, { from: number; to?: number }>>>({});
  useEffect(() => {
    setTimes((prev) => {
      const at = Date.now();
      let next = prev;
      for (const s of steps) {
        const st = states[s.key]?.state;
        const t = prev[s.key];
        if (st === "active" && !t) next = { ...next, [s.key]: { from: at } };
        if ((st === "done" || st === "failed") && t && !t.to) next = { ...next, [s.key]: { ...t, to: at } };
      }
      return next;
    });
  }, [steps, states]);

  // A clock for the active step's running time.
  const anyActive = steps.some((s) => states[s.key]?.state === "active");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!anyActive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyActive]);

  return (
    <ol aria-label="Progress" aria-live="polite" className="py-1">
      {steps.map((s, i) => {
        const st = states[s.key] ?? { state: "idle" as const };
        const t = times[s.key];
        const last = i === steps.length - 1;
        return (
          <li key={s.key} aria-current={st.state === "active" ? "step" : undefined} className="relative flex gap-3.5">
            <div className="relative flex w-7 shrink-0 flex-col items-center">
              <Node state={st.state} />
              {!last && (
                <span className="relative my-1 w-[2px] flex-1 overflow-hidden rounded-full bg-border">
                  <span className={cn("absolute inset-0 origin-top rounded-full bg-up transition-transform duration-500 ease-out", st.state === "done" ? "scale-y-100" : "scale-y-0")} />
                </span>
              )}
            </div>
            <div className={cn("min-w-0 flex-1", last ? "pb-1" : "pb-5")}>
              <p className={cn("text-[15px] font-semibold leading-7", st.state === "idle" ? "text-text-muted" : "text-text")}>{s.label}</p>
              {st.state === "active" && (
                <p className="flex items-center gap-2 text-secondary text-text-muted">
                  {activeLine(s.key, st.note)}
                  {t && <span className="tnum text-text-dim">{secs(Math.max(now, t.from) - t.from)}</span>}
                </p>
              )}
              {st.state === "done" && <p className="text-secondary text-up">{st.note ?? (t?.to ? `Done in ${secs(t.to - t.from)}` : "Done")}</p>}
              {st.state === "failed" && <p className="text-secondary text-down">{st.error ?? "Didn't go through"}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Node({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <span className="grid size-7 place-items-center rounded-full bg-up text-white">
        <Check size={16} strokeWidth={3} aria-hidden />
        <span className="sr-only">Done</span>
      </span>
    );
  if (state === "failed")
    return (
      <span className="grid size-7 place-items-center rounded-full bg-down text-white">
        <X size={16} strokeWidth={3} aria-hidden />
        <span className="sr-only">Failed</span>
      </span>
    );
  if (state === "active")
    return (
      <span className="relative grid size-7 place-items-center">
        <svg viewBox="0 0 28 28" className="absolute inset-0 size-7 animate-spin [animation-duration:1.1s]" aria-hidden>
          <circle cx="14" cy="14" r="12" fill="none" strokeWidth="2.5" className="stroke-primary/20" />
          <path d="M14 2a12 12 0 0 1 12 12" fill="none" strokeWidth="2.5" strokeLinecap="round" className="stroke-primary" />
        </svg>
        <span className="size-2.5 animate-live-dot rounded-full bg-primary" />
        <span className="sr-only">In progress</span>
      </span>
    );
  return (
    <span className="grid size-7 place-items-center rounded-full border-2 border-border bg-bg">
      <span className="sr-only">Waiting</span>
    </span>
  );
}

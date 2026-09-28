"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useApi } from "@/lib/client/api";
import { useAssetLookup } from "@/lib/client/assets";
import { runIntent, StopError, type StepKey, type StepState } from "@/lib/client/runner";
import type { Intent } from "@/lib/client/types";
import { useSigner } from "@/lib/client/wallet";
import { Checklist, type ChecklistStep } from "./Checklist";

function stepsFor(intent: Intent, label: (a: string) => string): { key: StepKey; label: string }[] {
  const s: { key: StepKey; label: string }[] = [];
  if (intent.kind.startsWith("buy")) s.push({ key: "fee", label: "Pay fee" });
  if (intent.kind === "sell_stack") s.push({ key: "release", label: "Release from position" });
  if (intent.kind === "redeem") s.push({ key: "release", label: "Redeem stocks" });
  for (const l of intent.legs) {
    if (l.status === "skipped") continue;
    s.push({ key: `leg-${l.leg_index}`, label: intent.kind.startsWith("buy") ? `Buy ${label(l.to_token)}` : `Sell ${label(l.from_token)}` });
  }
  if (intent.kind === "buy_stack") s.push({ key: "approve", label: "Approve tokens" }, { key: "deposit", label: "Create position" });
  if (intent.kind === "sell_stock" || intent.kind === "sell_stack") s.push({ key: "sellfee", label: "Pay sell fee" });
  return s;
}

/** Server state -> step states, so a resumed intent shows what's already done. */
function initialStates(intent: Intent): Partial<Record<StepKey, StepState>> {
  const st: Partial<Record<StepKey, StepState>> = {};
  if (intent.fee_receipt_id) st.fee = "done";
  if (intent.released_amounts) st.release = "done";
  for (const l of intent.legs) st[`leg-${l.leg_index}`] = l.status === "filled" ? "done" : l.status === "failed" || l.status === "expired" ? "failed" : "idle";
  if (intent.status === "done") {
    st.approve = "done";
    st.deposit = "done";
    st.sellfee = "done";
  }
  return st;
}

const doneTitle: Record<Intent["kind"], (i: Intent) => string> = {
  buy_stock: () => "Bought",
  buy_stack: (i) => `Position #${i.position_id} created`,
  sell_stock: () => "Sold",
  sell_stack: () => "Sold",
  redeem: () => "Stocks sent to your wallet",
};

/**
 * Progress checklist for one intent. Runs it on open, and on failure offers Retry and
 * "Stop and keep tokens" (FLOWS §3 failure handling).
 */
export function IntentSheet({ intentId, open, onClose, autoStart = true }: { intentId: string; open: boolean; onClose: () => void; autoStart?: boolean }) {
  const api = useApi();
  const getSigner = useSigner();
  const assets = useAssetLookup();
  const qc = useQueryClient();
  const [intent, setIntent] = useState<Intent | null>(null);
  const [states, setStates] = useState<Partial<Record<StepKey, { state: StepState; note?: string; error?: string }>>>({});
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState<{ message: string; step: StepKey } | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    setRunning(true);
    setStopped(null);
    try {
      const signer = await getSigner();
      const final = await runIntent({
        api,
        signer,
        intentId,
        onIntent: (i) => {
          setIntent(i);
          setStates((prev) => {
            const next = { ...prev };
            for (const [k, v] of Object.entries(initialStates(i))) {
              const key = k as StepKey;
              if (v === "done" || !next[key]) next[key] = { state: v! };
            }
            return next;
          });
        },
        onProgress: (p) => setStates((prev) => ({ ...prev, [p.step]: { state: p.state, note: p.note } })),
      });
      setIntent(final);
    } catch (e) {
      const err = e as Error;
      const step = e instanceof StopError ? e.step : ((Object.entries(states).find(([, v]) => v?.state === "active")?.[0] as StepKey) ?? "fee");
      const msg = /User rejected|denied|rejected the request/i.test(err.message) ? "You cancelled the signature." : err.message;
      setStates((prev) => ({ ...prev, [step]: { state: "failed", error: msg } }));
      setStopped({ message: msg, step });
    } finally {
      setRunning(false);
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["intents"] });
    }
  }, [api, getSigner, intentId, qc, states]);

  useEffect(() => {
    if (open && autoStart && !started.current) {
      started.current = true;
      void run();
    }
  }, [open, autoStart, run]);

  const retry = async () => {
    if (!stopped) return;
    if (stopped.step.startsWith("leg-")) {
      const legIndex = Number(stopped.step.slice(4));
      const leg = intent?.legs.find((l) => l.leg_index === legIndex);
      // A leg still settling keeps its order; only failed/expired legs get a fresh attempt.
      if (leg && (leg.status === "failed" || leg.status === "expired" || leg.status === "quoted")) {
        await api(`/api/intents/${intentId}`, { method: "PATCH", json: { action: "retry", legIndex } }).catch(() => undefined);
      }
    }
    void run();
  };

  const stopAndKeep = async () => {
    try {
      await api(`/api/intents/${intentId}`, { method: "PATCH", json: { action: "cancel" } });
    } catch (e) {
      setStopError((e as Error).message);
      setConfirmStop(false);
      return;
    }
    qc.invalidateQueries({ queryKey: ["intents"] });
    qc.invalidateQueries({ queryKey: ["portfolio"] });
    onClose();
  };

  const steps: ChecklistStep[] = intent
    ? stepsFor(intent, assets.label).map((s) => ({ key: s.key, label: s.label, state: states[s.key]?.state ?? "idle", note: states[s.key]?.note, error: states[s.key]?.error }))
    : [];
  const done = intent?.status === "done";
  const boughtAny = intent?.legs.some((l) => l.status === "filled") ?? false;

  return (
    <Sheet open={open} onClose={onClose} title={done ? undefined : "Working on it"} dismissable={!running}>
      {done && intent ? (
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircle2 size={72} className="text-up" strokeWidth={1.5} />
          <p className="mt-4 text-[22px] font-bold">{doneTitle[intent.kind](intent)}</p>
          {intent.kind === "buy_stack" && (
            <p className="mt-1 max-w-[32ch] text-secondary text-text-muted">Your position holds the exact tokens bought. Weights aren&apos;t rebalanced.</p>
          )}
          <div className="mt-6 flex w-full flex-col gap-2">
            {intent.kind === "buy_stack" && intent.position_id && (
              <Link href={`/app/position/${intent.position_id}`} onClick={onClose}>
                <Button className="w-full">View position</Button>
              </Link>
            )}
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="-mt-2 mb-5 text-center text-secondary text-text-muted">Steps run one after another. Keep this open until they finish.</p>
          <Checklist steps={steps} />
          {stopped && !running && (
            <div className="mt-6 space-y-2">
              {stopError && <p className="text-center text-secondary text-down">Couldn&apos;t stop: {stopError}</p>}
              <Button className="w-full" onClick={retry}>
                Retry
              </Button>
              {intent?.kind.startsWith("buy") &&
                (confirmStop ? (
                  <div className="rounded-card bg-surface-2 p-4">
                    <p className="text-secondary text-text">
                      {boughtAny ? "Tokens already bought stay in your wallet as single stocks." : "Nothing was bought yet."}
                      {intent.fee_receipt_id ? " The 1% fee isn't refunded." : " No fee was taken."}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button variant="secondary" size="md" className="flex-1" onClick={() => setConfirmStop(false)}>
                        Keep going
                      </Button>
                      <Button size="md" className="flex-1 bg-down hover:bg-down/90" onClick={stopAndKeep}>
                        Stop
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="secondary" className="w-full" onClick={() => setConfirmStop(true)}>
                    Stop and keep tokens
                  </Button>
                ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useApi } from "@/lib/client/api";
import { useAssetLookup } from "@/lib/client/assets";
import { runIntent, StopError, type StepKey, type StepState } from "@/lib/client/runner";
import type { Intent } from "@/lib/client/types";
import { useSigner } from "@/lib/client/wallet";
import { useToast } from "@/components/ui/Toast";

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

const doneTitle: Record<Intent["kind"], (i: Intent, label: (a: string) => string) => string> = {
  buy_stock: (i, l) => `Bought ${l(i.legs[0]?.to_token ?? "")}`.trim(),
  buy_stack: (i) => `Position #${i.position_id} created`,
  sell_stock: (i, l) => `Sold ${l(i.legs[0]?.from_token ?? "")}`.trim(),
  sell_stack: () => "Sold",
  redeem: () => "Stocks sent to your wallet",
};

/**
 * Runs one intent behind a single button that keeps spinning until the trade is done, in place of
 * the confirm button that started it. Legs still run in sequence and each is persisted
 * server-side; on failure it offers Retry and "Stop and keep tokens" (FLOWS §3 failure handling).
 * On success it toasts and calls onFinished.
 */
export function IntentProgress({ intentId, title, onFinished, onRunning }: { intentId: string; title: string; onFinished: () => void; onRunning?: (running: boolean) => void }) {
  const api = useApi();
  const getSigner = useSigner();
  const assets = useAssetLookup();
  const qc = useQueryClient();
  const toast = useToast();
  const [intent, setIntent] = useState<Intent | null>(null);
  const [states, setStates] = useState<Partial<Record<StepKey, { state: StepState; note?: string; error?: string }>>>({});
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState<{ message: string; step: StepKey } | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => onRunning?.(running), [running, onRunning]);

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
      if (final.status === "done") {
        toast({ title: doneTitle[final.kind](final, assets.label), tone: "up" });
        onFinished();
      }
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
  }, [api, getSigner, intentId, qc, states, toast, assets.label, onFinished]);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void run();
    }
  }, [run]);

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
    onFinished();
  };

  const steps = intent ? stepsFor(intent, assets.label) : [];
  const current = steps.find((s) => states[s.key]?.state === "failed") ?? steps.find((s) => states[s.key]?.state === "active") ?? steps.find((s) => states[s.key]?.state !== "done");
  const failed = !!stopped && !running;
  const boughtAny = intent?.legs.some((l) => l.status === "filled") ?? false;

  return (
    <div>
      {failed ? (
        <div className="space-y-2">
          <p className="text-center text-secondary text-down" role="alert">
            {current ? `${current.label} failed: ` : ""}
            {stopped.message}
          </p>
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
      ) : (
        <Button className="w-full" loading aria-live="polite" aria-label={current ? `${title}: ${current.label}` : title}>
          {title}
        </Button>
      )}
    </div>
  );
}

/** Resuming an unfinished intent from the banner: the same spinning button in a sheet. */
export function IntentSheet({ intentId, title, open, onClose }: { intentId: string; title: string; open: boolean; onClose: () => void }) {
  const [running, setRunning] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="Resume" dismissable={!running}>
      <IntentProgress intentId={intentId} title={title} onFinished={onClose} onRunning={setRunning} />
    </Sheet>
  );
}

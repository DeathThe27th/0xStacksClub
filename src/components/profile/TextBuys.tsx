"use client";

import { useSigners, useWallets } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Bar } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { APP_NAME, BOT_MAX_BUY_USD } from "@/lib/constants";
import { useApi } from "@/lib/client/api";
import { usd } from "@/lib/format";

type Trading = { available: boolean; signerId: string | null; enabled: boolean; capUsd: number; dailyUsd: number };

const KEY = ["assistant-trading"];

/**
 * Buys by text. Off until the user turns it on: that adds our signer to their embedded wallet
 * (their consent, through Privy) and saves their limits. Every buy still needs a "yes" reply.
 */
export function TextBuys() {
  const api = useApi();
  const qc = useQueryClient();
  const { wallets } = useWallets();
  const { addSigners, removeSigners } = useSigners();
  const embedded = wallets.find((w) => w.walletClientType === "privy");
  const q = useQuery({ queryKey: KEY, queryFn: () => api<Trading>("/api/assistant/trading") });
  const [cap, setCap] = useState("");
  const [daily, setDaily] = useState("");
  const data = q.data;
  useEffect(() => {
    if (data) {
      setCap(String(data.capUsd));
      setDaily(String(data.dailyUsd));
    }
  }, [data]);

  const capUsd = Number(cap);
  const dailyUsd = Number(daily);
  const valid = Number.isFinite(capUsd) && capUsd >= 1 && capUsd <= BOT_MAX_BUY_USD && Number.isFinite(dailyUsd) && dailyUsd >= capUsd && dailyUsd <= 50_000;

  const save = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (enabled) {
        if (!embedded || !data?.signerId) throw new Error(`Text buys need the wallet ${APP_NAME} created for you at sign-up.`);
        // The user's consent: this lets our server key ask this wallet to sign. It can be removed any time.
        await addSigners({ address: embedded.address, signers: [{ signerId: data.signerId, policyIds: [] }] });
      }
      const saved = await api<Trading>("/api/assistant/trading", { method: "PUT", json: { enabled, capUsd, dailyUsd } });
      // Turning it off also takes the permission back, so nothing can sign for this wallet.
      if (!enabled && embedded && data?.enabled) await removeSigners({ address: embedded.address }).catch(() => undefined);
      return saved;
    },
    onSuccess: (s) => qc.setQueryData(KEY, s),
  });

  if (q.isLoading) return <Bar className="h-24 w-full" />;
  if (!data?.available) return null;
  const dirty = data.enabled && (capUsd !== data.capUsd || dailyUsd !== data.dailyUsd);

  return (
    <section className="rounded-card bg-surface-2 p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold">Buy by text</p>
          <p className="mt-0.5 text-secondary text-text-muted">
            {data.enabled ? `On. Up to ${usd(data.capUsd)} a buy, ${usd(data.dailyUsd)} a day.` : `Let ${APP_NAME} buy a stock when you text it and reply YES.`}
          </p>
        </div>
        <Switch checked={data.enabled} label="Buy by text" onChange={(v) => (v && !valid ? undefined : save.mutate(v))} />
      </div>

      {!embedded && !data.enabled && (
        <p className="mt-3 text-[13px] text-text-muted">This only works with the wallet {APP_NAME} created for you at sign-up, not a connected one.</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Limit label="Most per buy" value={cap} onChange={setCap} />
        <Limit label="Most per day" value={daily} onChange={setDaily} />
      </div>
      {!valid && <p className="mt-2 text-[12px] text-down">Per buy: $1 to {usd(BOT_MAX_BUY_USD)}. Per day: at least the per-buy amount.</p>}
      {dirty && (
        <Button size="md" className="mt-3 w-full" disabled={!valid} loading={save.isPending} onClick={() => save.mutate(true)}>
          Save limits
        </Button>
      )}
      {save.isError && (
        <p className="mt-3 text-secondary text-down" role="alert">
          {(save.error as Error).message}
        </p>
      )}
      <p className="mt-3 text-[12px] leading-5 text-text-muted">
        Turning this on gives {APP_NAME} permission to sign with your {APP_NAME} wallet. It only uses that to make the buys you confirm by replying YES, within these limits. You pay
        the usual 1% fee and network fee. Turning it off removes the permission.
      </p>
    </section>
  );
}

function Limit({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-text-muted">{label}</span>
      <span className="flex items-center rounded-chip border border-border bg-surface focus-within:border-primary">
        <span className="pl-3 text-text-muted">$</span>
        <input value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" maxLength={8} className="h-11 w-full bg-transparent pl-1 pr-3 tnum outline-none" />
      </span>
    </label>
  );
}

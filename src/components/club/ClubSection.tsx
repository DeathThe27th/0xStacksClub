"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Flag, Pencil, Send, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Bar } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { useApi } from "@/lib/client/api";
import { useActiveWallet } from "@/lib/client/wallet";
import { normalizeTelegramUrl, TELEGRAM_URL_ERROR } from "@/lib/telegram";

type LinkState = { hasLink: boolean; url: string | null; isOwner: boolean; isMember: boolean };

/**
 * A basket's Club: its creator's Telegram group. The server only returns the link to wallets that
 * hold the basket (and to the creator). There is no in-app chat.
 */
export function ClubSection({ stackId, ticker }: { stackId: string; ticker?: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  // Access depends on who's asking, so the viewer's wallet is part of the key.
  const wallet = useActiveWallet()?.address ?? null;
  const key = ["club-link", stackId, wallet];
  const q = useQuery({ queryKey: key, queryFn: () => api<LinkState>(`/api/clubs/${stackId}/link`) });
  const report = useMutation({
    mutationFn: () => api(`/api/clubs/${stackId}/link/report`, { method: "POST" }),
    onSuccess: () => toast({ title: "Link reported. Thanks for flagging it." }),
    onError: (e) => toast({ title: (e as Error).message, tone: "down" }),
  });

  const d = q.data;
  return (
    <section className="mx-gutter mt-5 rounded-card border border-border bg-surface p-4 lg:mx-0">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-link">
          <Send size={17} />
        </span>
        <h2 className="flex-1 text-[15px] font-semibold">{ticker ? `$${ticker} Club` : "Club"}</h2>
        {d?.isOwner && !editing && (
          <button onClick={() => setEditing(true)} className="press flex items-center gap-1 text-[13px] text-link">
            <Pencil size={14} /> {d.hasLink ? "Edit link" : "Add link"}
          </button>
        )}
      </div>

      <div className="mt-3">
        {q.isLoading ? (
          <Bar className="h-11 w-full" />
        ) : q.isError ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : editing && d?.isOwner ? (
          <LinkEditor
            stackId={stackId}
            initial={d.url ?? ""}
            onDone={(url) => {
              setEditing(false);
              if (url !== undefined) qc.setQueryData<LinkState>(key, { ...d, hasLink: url !== null, url });
            }}
          />
        ) : !d?.hasLink ? (
          <p className="text-[14px] text-text-muted">
            {d?.isOwner ? "Add a Telegram group link. Only people holding this basket will see it." : "The creator hasn't added a Telegram group yet."}
          </p>
        ) : d.url ? (
          <>
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="press flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-[15px] font-semibold text-on-primary hover:bg-primary-press"
            >
              Join the Telegram group <ExternalLink size={15} />
            </a>
            <p className="mt-2 truncate text-center text-[12px] text-text-muted">{d.url}</p>
            <p className="mt-3 flex items-start gap-2 rounded-chip bg-warn/10 px-3 py-2 text-[13px] text-warn">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              Admins will never DM you first. Never share your seed phrase.
            </p>
            {!d.isOwner && (
              <button
                onClick={() => report.mutate()}
                disabled={report.isPending || report.isSuccess}
                className="press mt-3 flex items-center gap-1.5 text-[13px] text-text-muted hover:text-down disabled:opacity-60"
              >
                <Flag size={14} /> {report.isSuccess ? "Reported" : "Report link"}
              </button>
            )}
          </>
        ) : (
          <p className="text-[14px] text-text-muted">Buy this basket to join the club.</p>
        )}
      </div>
    </section>
  );
}

function LinkEditor({ stackId, initial, onDone }: { stackId: string; initial: string; onDone: (url?: string | null) => void }) {
  const api = useApi();
  const toast = useToast();
  const [value, setValue] = useState(initial);
  const valid = !value.trim() || normalizeTelegramUrl(value) !== null;
  const save = useMutation({
    mutationFn: (url: string | null) => api<{ url: string | null }>(`/api/clubs/${stackId}/link`, { method: "PUT", json: { url } }),
    onSuccess: (r) => {
      toast({ title: r.url ? "Club link saved" : "Club link removed", tone: "up" });
      onDone(r.url);
    },
    onError: (e) => toast({ title: (e as Error).message, tone: "down" }),
  });
  return (
    <div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={200}
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        placeholder="t.me/yourgroup"
        aria-label="Telegram group link"
        aria-invalid={!valid}
        className="h-11 w-full rounded-chip border border-border bg-surface-2 px-3 outline-none focus:border-primary"
      />
      {!valid && <p className="mt-1.5 text-[13px] text-down">{TELEGRAM_URL_ERROR}</p>}
      <div className="mt-3 flex gap-2">
        <Button size="md" className="flex-1" disabled={!valid} loading={save.isPending} onClick={() => save.mutate(value.trim() ? value.trim() : null)}>
          {value.trim() ? "Save" : "Remove link"}
        </Button>
        <Button size="md" variant="secondary" onClick={() => onDone()}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Bar } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { APP_NAME } from "@/lib/constants";
import { useApi } from "@/lib/client/api";

export type TelegramStatus = {
  available: boolean;
  bot: string | null;
  linked: { since: string } | null;
  pending: { url: string; expiresAt: string } | null;
};

const KEY = ["telegram"];

export function useTelegram(enabled = true) {
  const api = useApi();
  const { ready, authenticated } = usePrivy();
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<TelegramStatus>("/api/telegram"),
    enabled: enabled && ready && authenticated,
    // After the link is opened, watch for Telegram to report back.
    refetchInterval: (q) => (q.state.data?.pending && !q.state.data.linked ? 3000 : false),
  });
}

/**
 * Connect Telegram: a link to our bot that carries a one-time code. Pressing Start in Telegram
 * connects that Telegram account to this one.
 */
export function TelegramConnect() {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useTelegram();
  const set = (s: TelegramStatus) => qc.setQueryData(KEY, s);
  const start = useMutation({
    mutationFn: () => api<TelegramStatus>("/api/telegram", { method: "POST" }),
    onSuccess: (s) => {
      set(s);
      if (s.pending) window.open(s.pending.url, "_blank", "noopener");
    },
    onError: (e) => toast({ title: "Couldn't start", body: (e as Error).message, tone: "down" }),
  });
  const stop = useMutation({
    mutationFn: () => api<TelegramStatus>("/api/telegram", { method: "DELETE" }),
    onSuccess: set,
    onError: (e) => toast({ title: "Couldn't disconnect", body: (e as Error).message, tone: "down" }),
  });

  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) {
    return (
      <div className="space-y-3">
        <Bar className="h-5 w-48" />
        <Bar className="h-14 w-full" />
      </div>
    );
  }
  const { linked, pending, bot, available } = q.data;

  if (linked) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-card bg-surface-2 p-4">
          <Send size={22} className="shrink-0 text-up" />
          <div className="min-w-0">
            <p className="text-[16px] font-semibold">Telegram connected</p>
            <p className="text-secondary text-text-muted">Message the bot like you would a person.</p>
          </div>
        </div>
        {bot && (
          <a href={`https://t.me/${bot}`} target="_blank" rel="noreferrer" className="block">
            <Button className="w-full">Open Telegram</Button>
          </a>
        )}
        <Button variant="secondary" className="w-full text-down" loading={stop.isPending} onClick={() => stop.mutate()}>
          Disconnect Telegram
        </Button>
      </div>
    );
  }

  if (!available) return <p className="py-6 text-center text-[15px] text-text-muted">{APP_NAME} on Telegram isn&apos;t available yet.</p>;

  return (
    <div className="space-y-4">
      <p className="text-secondary text-text-muted">
        Ask for prices, check your portfolio and get buy links in Telegram. Tap the button, then press <span className="text-text">Start</span> in the chat that opens.
      </p>
      {pending ? (
        <>
          <a href={pending.url} target="_blank" rel="noreferrer" className="block">
            <Button className="w-full">
              <Send size={18} /> Open Telegram to finish
            </Button>
          </a>
          <p className="text-center text-[13px] text-text-muted" role="status">
            Waiting for you to press Start. The link works for 10 minutes.
          </p>
          <Button variant="ghost" size="md" className="w-full" loading={stop.isPending} onClick={() => stop.mutate()}>
            Cancel
          </Button>
        </>
      ) : (
        <Button className="w-full" loading={start.isPending} onClick={() => start.mutate()}>
          <Send size={18} /> Connect Telegram
        </Button>
      )}
    </div>
  );
}

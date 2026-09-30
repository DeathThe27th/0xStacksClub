"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Bar } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { APP_NAME } from "@/lib/constants";
import { useApi } from "@/lib/client/api";
import { normalizePhone } from "@/lib/phone";
import { TextBuys } from "./TextBuys";

export type IMessageStatus = {
  available: boolean;
  linked: { phone: string; since: string; number: string } | null;
  pending: { code: string; expiresAt: string; phone: string; number: string; smsUrl: string } | null;
};

const KEY = ["imessage"];

export function useIMessage(enabled = true) {
  const api = useApi();
  const { ready, authenticated } = usePrivy();
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<IMessageStatus>("/api/imessage"),
    enabled: enabled && ready && authenticated,
    // While a code is waiting for its text, watch for the link to land.
    refetchInterval: (q) => (q.state.data?.pending ? 3000 : false),
  });
}

/**
 * Connect iMessage (Settings): the user names their phone, gets a 10-minute code and texts it to us
 * from that phone. They always text first; we never message a number that hasn't.
 */
export function IMessageConnect() {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useIMessage();
  const [phone, setPhone] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const set = (s: IMessageStatus) => qc.setQueryData(KEY, s);

  const start = useMutation({ mutationFn: () => api<IMessageStatus>("/api/imessage", { method: "POST", json: { phone } }), onSuccess: set });
  const stop = useMutation({
    mutationFn: () => api<IMessageStatus>("/api/imessage", { method: "DELETE" }),
    onSuccess: (s) => {
      set(s);
      start.reset();
    },
    onError: (e) => toast({ title: "Couldn't disconnect", body: (e as Error).message, tone: "down" }),
  });

  const pending = q.data?.pending ?? null;
  const linked = q.data?.linked ?? null;
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pending]);
  const linkedPhone = linked?.phone;
  useEffect(() => {
    if (linkedPhone && start.isSuccess) toast({ title: "iMessage connected", body: linkedPhone, tone: "up" });
    // Only when the link lands after a code was made in this sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedPhone]);

  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!q.data) {
    return (
      <div className="space-y-3">
        <Bar className="h-5 w-48" />
        <Bar className="h-12 w-full" />
        <Bar className="h-14 w-full" />
      </div>
    );
  }

  if (linked) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-card bg-surface-2 p-4">
          <MessageCircle size={22} className="shrink-0 text-up" />
          <div className="min-w-0">
            <p className="text-[16px] font-semibold tnum">{linked.phone}</p>
            <p className="text-secondary text-text-muted">Connected. Text &ldquo;help&rdquo; to see what you can ask.</p>
          </div>
        </div>
        <TextBuys />
        <p className="text-secondary text-text-muted">Texts can show prices, news and your portfolio. With Trade by text off, a buy is only ever a link for you to confirm here.</p>
        <Button variant="secondary" className="w-full text-down" loading={stop.isPending} onClick={() => stop.mutate()}>
          Disconnect iMessage
        </Button>
      </div>
    );
  }

  if (!q.data.available) {
    return <p className="py-6 text-center text-[15px] text-text-muted">Texting {APP_NAME} isn&apos;t available yet.</p>;
  }

  if (pending) {
    const left = Math.max(0, Math.round((new Date(pending.expiresAt).getTime() - now) / 1000));
    const expired = left === 0;
    return (
      <div className="space-y-4 text-center">
        <p className="text-secondary text-text-muted">Send this code from {pending.phone} to connect.</p>
        <p className="text-[40px] font-bold leading-none tracking-[0.12em] tnum" aria-label={`Code ${pending.code.split("").join(" ")}`}>
          {pending.code}
        </p>
        <p className={expired ? "text-secondary text-down" : "text-secondary text-text-muted"} role="status">
          {expired ? "This code has expired." : `Valid for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}
        </p>
        {!expired && (
          <>
            <a href={pending.smsUrl} className="block">
              <Button className="w-full">
                <MessageCircle size={18} /> Text us to connect
              </Button>
            </a>
            <p className="text-[13px] text-text-muted">
              Opens Messages with the text ready to send. Or text <span className="tnum text-text">link {pending.code}</span> to{" "}
              <span className="tnum text-text">{pending.number}</span> yourself.
            </p>
          </>
        )}
        <Button variant="ghost" size="md" className="w-full" loading={stop.isPending} onClick={() => stop.mutate()}>
          {expired ? "Start again" : "Use a different number"}
        </Button>
      </div>
    );
  }

  const valid = normalizePhone(phone) !== null;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) start.mutate();
      }}
    >
      <p className="text-secondary text-text-muted">
        Check prices and your portfolio by text, and get a link to confirm a buy here. You text us first; we never message you out of the blue.
      </p>
      <label className="block">
        <span className="mb-1.5 block text-secondary text-text-muted">Your iPhone number</span>
        <span className="block rounded-chip border border-border bg-surface focus-within:border-primary">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 415 555 0132"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={24}
            className="h-12 w-full bg-transparent px-4 tnum outline-none"
          />
        </span>
        <span className="mt-1.5 block text-[12px] text-text-muted">Include the country code. Use the number your iMessages are sent from.</span>
      </label>
      {start.isError && (
        <p className="text-center text-secondary text-down" role="alert">
          {(start.error as Error).message}
        </p>
      )}
      <Button type="submit" className="w-full" loading={start.isPending} disabled={!valid}>
        Get my code
      </Button>
    </form>
  );
}

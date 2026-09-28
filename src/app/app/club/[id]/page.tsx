"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Lock, Megaphone, MoreHorizontal, Pin, PinOff, Send, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { HoldersTab } from "@/components/detail/Holders";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Bar } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { ApiError, useApi } from "@/lib/client/api";
import { useMe } from "@/lib/client/queries";
import type { ProfileLite, StackSummary } from "@/lib/client/types";

type Post = {
  id: string;
  profile_id: string | null;
  kind: "message" | "announcement";
  body: string;
  pinned: boolean;
  created_at: string;
  author: ProfileLite | null;
  isCreator: boolean;
};
type Viewer = { isOwner: boolean; isMember: boolean };
type ClubResponse = { stack: StackSummary; members: number; viewer: Viewer; pinned: Post[] };

/** A Stack's Club: holders-only chat run by the creator (announcements, pins, moderation). */
export default function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const [tab, setTab] = useState<"chat" | "members">("chat");
  const club = useQuery({ queryKey: ["club", id], queryFn: () => api<ClubResponse>(`/api/clubs/${id}`) });
  const posts = useQuery({
    queryKey: ["club-posts", id],
    queryFn: () => api<{ items: Post[]; viewer: Viewer }>(`/api/clubs/${id}/posts`),
    refetchInterval: 4000,
  });
  const viewer = posts.data?.viewer ?? club.data?.viewer;
  const s = club.data?.stack;

  const moderate = useMutation({
    mutationFn: ({ post, action }: { post: Post; action: "pin" | "unpin" | "remove" }) =>
      action === "remove"
        ? api(`/api/clubs/${id}/posts/${post.id}`, { method: "DELETE" })
        : api(`/api/clubs/${id}/posts/${post.id}`, { method: "PATCH", json: { pinned: action === "pin" } }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["club-posts", id] });
      qc.invalidateQueries({ queryKey: ["club", id] });
    },
  });

  if (club.isError) return <ErrorState message={(club.error as Error).message} onRetry={() => club.refetch()} />;
  const ordered = [...(posts.data?.items ?? [])].reverse(); // oldest first, newest at the bottom

  return (
    <div className="flex min-h-[calc(100dvh-env(safe-area-inset-top))] flex-col lg:mx-auto lg:min-h-0 lg:max-w-[760px] lg:pt-6">
      <header className="flex items-center gap-3 px-3 pt-3 lg:px-0 lg:pt-0">
        <button onClick={() => (history.length > 1 ? router.back() : router.push("/app"))} aria-label="Back" className="press grid h-11 w-9 place-items-center text-text-muted hover:text-text">
          <ChevronLeft size={26} />
        </button>
        <TokenLogo src={s?.image_url} label={s?.ticker ?? "?"} size={40} />
        <div className="min-w-0 flex-1">
          {s ? (
            <>
              <p className="truncate text-[18px] font-bold leading-tight">${s.ticker} Club</p>
              <p className="truncate text-secondary text-text-muted">
                by{" "}
                <Link href={`/app/u/${s.creator?.username}`} className="text-text hover:underline">
                  @{s.creator?.username ?? "creator"}
                </Link>{" "}
                · {club.data?.members} member{club.data?.members === 1 ? "" : "s"}
              </p>
            </>
          ) : (
            <Bar className="h-5 w-32" />
          )}
        </div>
        <Link href={`/app/stack/${id}`} className="press rounded-chip border border-border px-3 py-2 text-[14px] font-semibold hover:bg-surface">
          View Stack
        </Link>
      </header>

      {!!club.data?.pinned.length && (
        <div className="mx-gutter mt-4 space-y-2 lg:mx-0">
          {club.data.pinned.map((p) => (
            <div key={p.id} className="flex gap-2 rounded-card border border-primary/30 bg-primary/10 px-3 py-2.5">
              <Pin size={16} className="mt-0.5 shrink-0 text-link" />
              <p className="line-clamp-2 text-[14px]">{p.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 px-gutter lg:px-0">
        <Tabs
          tabs={[
            { id: "chat", label: "Chat" },
            { id: "members", label: `Members (${club.data?.members ?? "…"})` },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "members" ? (
        <div className="px-gutter lg:px-0">
          <HoldersTab targetType="stack" targetId={id} />
        </div>
      ) : (
        <>
          <div className="flex-1 px-gutter pb-4 pt-4 lg:px-0">
            {posts.isLoading ? (
              <div className="space-y-4">
                <Bar className="h-14 w-3/4" />
                <Bar className="h-14 w-2/3" />
              </div>
            ) : !ordered.length ? (
              <EmptyState
                icon={<Users size={24} />}
                title={viewer?.isMember ? "Say hi to the Club" : "No announcements yet"}
                body={viewer?.isMember ? "Messages here are only visible to holders." : "The chat is for holders. Announcements show up here."}
              />
            ) : (
              <ul className="space-y-4">
                {ordered.map((p) => (
                  <Message
                    key={p.id}
                    p={p}
                    mine={p.profile_id === me.data?.profile?.id}
                    isOwner={!!viewer?.isOwner}
                    onAction={(action) => moderate.mutate({ post: p, action })}
                  />
                ))}
              </ul>
            )}
            {!viewer?.isMember && s && (
              <div className="mt-6 flex items-center gap-3 rounded-card border border-border bg-surface p-4">
                <Lock size={20} className="shrink-0 text-text-muted" />
                <p className="flex-1 text-[14px] text-text-muted">The chat is for ${s.ticker} holders. Buy the Stack to join.</p>
                <Link href={`/app/stack/${id}`}>
                  <Button size="md">Buy ${s.ticker}</Button>
                </Link>
              </div>
            )}
          </div>
          {viewer?.isMember && <Composer stackId={id} isOwner={viewer.isOwner} />}
        </>
      )}
    </div>
  );
}

function Message({ p, mine, isOwner, onAction }: { p: Post; mine: boolean; isOwner: boolean; onAction: (a: "pin" | "unpin" | "remove") => void }) {
  const [menu, setMenu] = useState(false);
  const canModerate = isOwner || mine;
  return (
    <li className={cn("group flex gap-3", p.kind === "announcement" && "rounded-card border border-primary/30 bg-primary/5 p-3")}>
      <Link href={p.author ? `/app/u/${p.author.username}` : "#"} className="shrink-0">
        <Avatar src={p.author?.avatar_url} name={p.author?.username} size={34} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-[14px]">
          <span className="font-semibold">{p.author?.username ?? "member"}</span>
          {p.isCreator && <span className="rounded-badge bg-primary px-1.5 text-[11px] font-semibold text-on-primary">Creator</span>}
          {p.kind === "announcement" && (
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-link">
              <Megaphone size={12} /> Announcement
            </span>
          )}
          {p.pinned && <Pin size={12} className="text-text-muted" />}
          <span className="text-[12px] text-text-dim">{timeAgo(p.created_at)}</span>
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px]">{p.body}</p>
      </div>
      {canModerate && (
        <div className="relative">
          <button onClick={() => setMenu(!menu)} aria-label="Message actions" className="grid h-8 w-8 place-items-center rounded-full text-text-muted opacity-70 hover:bg-surface hover:opacity-100">
            <MoreHorizontal size={16} />
          </button>
          {menu && (
            <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-chip border border-border bg-surface shadow-[0_12px_32px_-12px_rgb(0_0_0/0.5)]">
              {isOwner && (
                <button
                  onClick={() => {
                    setMenu(false);
                    onAction(p.pinned ? "unpin" : "pin");
                  }}
                  className="flex h-10 w-full items-center gap-2 px-3 text-[14px] hover:bg-surface-2"
                >
                  {p.pinned ? <PinOff size={15} /> : <Pin size={15} />} {p.pinned ? "Unpin" : "Pin"}
                </button>
              )}
              <button
                onClick={() => {
                  setMenu(false);
                  onAction("remove");
                }}
                className="flex h-10 w-full items-center gap-2 px-3 text-[14px] text-down hover:bg-surface-2"
              >
                <Trash2 size={15} /> Remove
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Composer({ stackId, isOwner }: { stackId: string; isOwner: boolean }) {
  const api = useApi();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [announce, setAnnounce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(140, el.scrollHeight)}px`;
  }, [body]);
  const send = useMutation({
    mutationFn: () => api(`/api/clubs/${stackId}/posts`, { method: "POST", json: { body, kind: announce ? "announcement" : "message" } }),
    onSuccess: () => {
      setBody("");
      setAnnounce(false);
      setError(null);
      qc.invalidateQueries({ queryKey: ["club-posts", stackId] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't send"),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) send.mutate();
      }}
      className="sticky bottom-0 border-t border-border bg-bg/95 px-gutter pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:rounded-card lg:border lg:px-3 lg:pb-3"
    >
      {error && <p className="mb-2 text-[13px] text-down">{error}</p>}
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          rows={1}
          value={body}
          maxLength={500}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (body.trim()) send.mutate();
            }
          }}
          placeholder={announce ? "Write an announcement for all holders" : "Message the Club"}
          aria-label="Message"
          className="max-h-[140px] min-h-[44px] flex-1 resize-none rounded-chip border border-border bg-surface px-3 py-2.5 text-[15px] outline-none focus:border-primary"
        />
        <button type="submit" disabled={!body.trim() || send.isPending} aria-label="Send" className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-on-primary disabled:opacity-40">
          <Send size={18} />
        </button>
      </div>
      {isOwner && (
        <label className="mt-2 flex items-center gap-2 text-[13px] text-text-muted">
          <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} className="accent-primary" />
          <Megaphone size={14} /> Post as an announcement (visible to everyone)
        </label>
      )}
    </form>
  );
}

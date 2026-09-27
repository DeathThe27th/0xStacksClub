"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageSquare, MessagesSquare, Send, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { useApi } from "@/lib/client/api";
import { useMe } from "@/lib/client/queries";
import type { Comment } from "@/lib/client/types";

/** Feed tab: comments newest first, composer at the top, 280 chars, like and reply. */
export function FeedTab({ targetType, targetId }: { targetType: "asset" | "stack"; targetId: string }) {
  const api = useApi();
  const me = useMe();
  const qc = useQueryClient();
  const key = ["comments", targetType, targetId];
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const q = useQuery({ queryKey: key, queryFn: () => api<{ items: Comment[] }>(`/api/comments?targetType=${targetType}&targetId=${targetId}`) });

  const post = useMutation({
    mutationFn: () => api("/api/comments", { method: "POST", json: { targetType, targetId, body, parentId: replyTo?.id } }),
    onSuccess: () => {
      setBody("");
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["holders", targetType, targetId] });
    },
  });
  const like = useMutation({
    mutationFn: (c: Comment) => api(`/api/comments/${c.id}/like`, { method: c.likedByMe ? "DELETE" : "POST" }),
    onMutate: async (c) => {
      qc.setQueryData<{ items: Comment[] }>(key, (d) =>
        d ? { items: d.items.map((x) => (x.id === c.id ? { ...x, likedByMe: !c.likedByMe, likes: x.likes + (c.likedByMe ? -1 : 1) } : x)) } : d,
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const roots = (q.data?.items ?? []).filter((c) => !c.parent_id);
  const repliesOf = (id: string) => (q.data?.items ?? []).filter((c) => c.parent_id === id).reverse();

  return (
    <div className="pt-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) post.mutate();
        }}
        className="rounded-card border border-border bg-surface p-3"
      >
        {replyTo && (
          <p className="mb-2 flex items-center gap-2 text-[13px] text-text-muted">
            Replying to @{replyTo.author?.username}
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
              <X size={14} />
            </button>
          </p>
        )}
        <div className="flex items-start gap-3">
          <Avatar src={me.data?.profile?.avatar_url} name={me.data?.profile?.username} size={32} />
          <textarea
            value={body}
            maxLength={280}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Share your take"
            aria-label="Comment"
            className="min-h-[44px] flex-1 resize-none bg-transparent text-[15px] outline-none"
          />
        </div>
        <div className="mt-2 flex items-center justify-end gap-3">
          <span className={cn("text-[12px] tnum", body.length > 260 ? "text-warn" : "text-text-dim")}>{body.length}/280</span>
          <button type="submit" disabled={!body.trim() || post.isPending} className="press flex h-9 items-center gap-1.5 rounded-chip bg-primary px-3 text-[14px] font-semibold text-white disabled:opacity-40">
            <Send size={14} /> Post
          </button>
        </div>
        {post.isError && <p className="mt-2 text-[13px] text-down">{(post.error as Error).message}</p>}
      </form>

      <div className="mt-5">
        {q.isLoading ? (
          <RowSkeleton count={3} />
        ) : q.isError ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : !roots.length ? (
          <EmptyState icon={<MessagesSquare size={24} />} title="No comments yet" body="Start the conversation." />
        ) : (
          <ul className="space-y-5">
            {roots.map((c) => (
              <li key={c.id}>
                <CommentItem c={c} onLike={() => like.mutate(c)} onReply={() => setReplyTo(c)} />
                {repliesOf(c.id).map((r) => (
                  <div key={r.id} className="relative ml-5 mt-3 pl-7">
                    <span aria-hidden className="absolute left-0 top-0 h-4 w-5 rounded-bl-lg border-b border-l border-border" />
                    <CommentItem c={r} small onLike={() => like.mutate(r)} />
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CommentItem({ c, onLike, onReply, small }: { c: Comment; onLike: () => void; onReply?: () => void; small?: boolean }) {
  return (
    <div className="flex gap-3">
      <Link href={c.author ? `/app/u/${c.author.username}` : "#"}>
        <Avatar src={c.author?.avatar_url} name={c.author?.username} size={small ? 28 : 36} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-[14px]">
          <span className="font-semibold">{c.author?.username ?? "deleted"}</span>
          <span className="ml-2 text-text-dim">{timeAgo(c.created_at)}</span>
          {c.is_demo && <span className="ml-2 rounded-badge bg-surface-2 px-1.5 text-[11px] text-text-muted">demo</span>}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px]">{c.body}</p>
        <div className="mt-1.5 flex items-center gap-4 text-[13px] text-text-dim">
          <button onClick={onLike} className={cn("flex h-7 items-center gap-1", c.likedByMe && "text-down")} aria-pressed={c.likedByMe} aria-label="Like">
            <Heart size={14} className={cn(c.likedByMe && "fill-down")} /> {c.likes}
          </button>
          {onReply && (
            <button onClick={onReply} className="flex h-7 items-center gap-1" aria-label="Reply">
              <MessageSquare size={14} /> {c.replies}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

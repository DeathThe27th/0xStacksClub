"use client";

import { useQuery } from "@tanstack/react-query";
import { Heart, MessageSquare, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Change } from "@/components/ui/Change";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Switch } from "@/components/ui/Switch";
import { price, usd } from "@/lib/format";
import { useApi } from "@/lib/client/api";
import type { Holder } from "@/lib/client/types";
import { APP_NAME } from "@/lib/constants";

/** Holders tab (UI_SPEC §4.4): our users only, with a Friends filter and inline latest comment. */
export function HoldersTab({ targetType, targetId }: { targetType: "asset" | "stack"; targetId: string }) {
  const api = useApi();
  const [friends, setFriends] = useState(false);
  const q = useQuery({
    queryKey: ["holders", targetType, targetId],
    queryFn: () => api<{ items: Holder[] }>(`/api/holders?targetType=${targetType}&targetId=${targetId}`),
  });
  const items = (q.data?.items ?? []).filter((h) => !friends || h.isFriend);
  return (
    <div>
      <label className="flex items-center gap-3 py-4">
        <Switch checked={friends} onChange={setFriends} label="Friends only" />
        <span className="text-[16px] text-text-muted">Friends</span>
      </label>
      {q.isLoading ? (
        <RowSkeleton count={3} />
      ) : q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : !items.length ? (
        <EmptyState icon={<Users size={24} />} title={friends ? "None of your friends hold this" : `No ${APP_NAME} holders yet`} body={friends ? undefined : "Be the first to buy it."} />
      ) : (
        <ul className="space-y-5">
          {items.map((h) => (
            <li key={h.profile.id}>
              <Link href={`/app/u/${h.profile.username}`} className="flex items-center gap-3">
                <Avatar src={h.profile.avatar_url} name={h.profile.username} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-semibold">{h.profile.username}</p>
                  <p className="text-secondary text-text-muted">{h.avgEntryUsd !== null ? `Avg. entry: ${price(h.avgEntryUsd)}` : `Cost basis: ${usd(h.costBasisUsd)}`}</p>
                </div>
                <div className="text-right">
                  <p className="text-[17px] font-semibold tnum">{usd(h.valueUsd)}</p>
                  <Change value={h.pnlPct} className="justify-end" />
                </div>
              </Link>
              {h.latestComment && (
                <div className="relative ml-5 mt-1 pl-7">
                  <span aria-hidden className="absolute left-0 top-0 h-4 w-5 rounded-bl-lg border-b border-l border-border" />
                  <p className="text-[15px]">{h.latestComment.body}</p>
                  <p className="mt-1 flex items-center gap-4 text-[13px] text-text-dim">
                    <span className="flex items-center gap-1">
                      <Heart size={14} /> {h.latestComment.likes}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare size={14} /> {h.latestComment.replies}
                    </span>
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

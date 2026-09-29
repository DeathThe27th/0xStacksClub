"use client";

/* eslint-disable @next/next/no-img-element */
import { useQuery } from "@tanstack/react-query";
import { Newspaper } from "lucide-react";
import { useState } from "react";
import { Bar } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { timeAgo } from "@/lib/format";
import { useApi } from "@/lib/client/api";

type NewsItem = { id: string; headline: string; summary: string; source: string; url: string; image: string | null; at: number; tickers?: string[] };
type NewsResponse = { connected: boolean; items: NewsItem[]; matched?: boolean };

/** Recent news about the stock behind a token. Links open the publisher's article. */
export function NewsSection({ ticker, name }: { ticker: string; name: string }) {
  return <NewsFeed title={`News about ${name}`} path={`/api/news?ticker=${encodeURIComponent(ticker)}`} emptyBody="Headlines about this stock will show here." />;
}

/**
 * A news list from /api/news. `tagged` shows which basket stocks each story is about; `limit`
 * collapses the list behind a "Show more" button.
 */
export function NewsFeed({
  title,
  subtitle,
  path,
  emptyBody,
  tagged = false,
  limit,
}: {
  title: string;
  subtitle?: (data: NewsResponse) => string | null;
  path: string;
  emptyBody?: string;
  tagged?: boolean;
  limit?: number;
}) {
  const api = useApi();
  const [all, setAll] = useState(false);
  const q = useQuery({ queryKey: ["news", path], queryFn: () => api<NewsResponse>(path), staleTime: 5 * 60_000 });
  const items = q.data?.items ?? [];
  const shown = limit && !all ? items.slice(0, limit) : items;
  const sub = q.data && subtitle ? subtitle(q.data) : null;
  return (
    <section className="px-gutter lg:px-0">
      <h2 className="text-section">{title}</h2>
      {sub && <p className="mt-0.5 text-secondary text-text-muted">{sub}</p>}
      {q.isLoading ? (
        <div className="mt-4 space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Bar className="h-16 w-16 rounded-chip" />
              <div className="flex-1 space-y-2">
                <Bar className="h-4 w-full" />
                <Bar className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState message="News didn't load." onRetry={() => q.refetch()} />
      ) : !q.data?.connected ? (
        <EmptyState icon={<Newspaper size={22} />} title="News isn't connected yet" body={emptyBody} />
      ) : !items.length ? (
        <EmptyState icon={<Newspaper size={22} />} title="No news this week" />
      ) : (
        <>
          <ul className="mt-3 divide-y divide-border">
            {shown.map((n) => (
              <li key={n.id}>
                <a href={n.url} target="_blank" rel="noreferrer noopener" className="group flex gap-3 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-text-muted">
                      {tagged &&
                        n.tickers?.map((t) => (
                          <span key={t} className="rounded-badge bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-text">
                            {t}
                          </span>
                        ))}
                      <span>
                        {n.source}
                        {n.source && " · "}
                        {timeAgo(n.at) === "now" ? "just now" : `${timeAgo(n.at)} ago`}
                      </span>
                    </p>
                    <p className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug group-hover:underline">{n.headline}</p>
                    {n.summary && <p className="mt-1 line-clamp-2 text-[13px] text-text-muted">{n.summary}</p>}
                  </div>
                  {n.image && <img src={n.image} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-chip bg-surface object-cover" />}
                </a>
              </li>
            ))}
          </ul>
          {limit && items.length > limit && (
            <button onClick={() => setAll((a) => !a)} className="press mt-1 h-10 w-full rounded-chip bg-surface-2 text-[14px] font-medium">
              {all ? "Show less" : `Show ${items.length - limit} more`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

"use client";

/* eslint-disable @next/next/no-img-element */
import { useQuery } from "@tanstack/react-query";
import { Newspaper } from "lucide-react";
import { Bar } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { timeAgo } from "@/lib/format";
import { useApi } from "@/lib/client/api";

type NewsItem = { id: string; headline: string; summary: string; source: string; url: string; image: string | null; at: number };

/** Recent news about the stock behind a token. Links open the publisher's article. */
export function NewsSection({ ticker, name }: { ticker: string; name: string }) {
  const api = useApi();
  const q = useQuery({
    queryKey: ["news", ticker],
    queryFn: () => api<{ connected: boolean; items: NewsItem[] }>(`/api/news?ticker=${encodeURIComponent(ticker)}`),
    staleTime: 5 * 60_000,
  });
  return (
    <section className="px-gutter lg:px-0">
      <h2 className="text-section">News about {name}</h2>
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
        <EmptyState icon={<Newspaper size={22} />} title="News isn't connected yet" body="Headlines about this stock will show here." />
      ) : !q.data.items.length ? (
        <EmptyState icon={<Newspaper size={22} />} title="No news this week" />
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {q.data.items.map((n) => (
            <li key={n.id}>
              <a href={n.url} target="_blank" rel="noreferrer noopener" className="group flex gap-3 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-text-muted">
                    {n.source}
                    {n.source && " · "}
                    {timeAgo(n.at) === "now" ? "just now" : `${timeAgo(n.at)} ago`}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug group-hover:underline">{n.headline}</p>
                  {n.summary && <p className="mt-1 line-clamp-2 text-[13px] text-text-muted">{n.summary}</p>}
                </div>
                {n.image && <img src={n.image} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-chip bg-surface object-cover" />}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

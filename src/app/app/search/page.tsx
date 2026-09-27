"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, Search as SearchIcon, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AssetRow, StackRow } from "@/components/market/Rows";
import { Avatar } from "@/components/ui/Avatar";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/States";
import { useApi } from "@/lib/client/api";
import type { AssetItem, ProfileLite, StackSummary } from "@/lib/client/types";

const KEY = "stacksclub:recent-searches";
function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export default function SearchPage() {
  const api = useApi();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => setRecent(readRecent()), []);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const res = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api<{ assets: AssetItem[]; stacks: StackSummary[]; people: (ProfileLite & { bio: string | null })[] }>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length > 0,
  });

  const remember = () => {
    if (!debounced) return;
    const next = [debounced, ...recent.filter((r) => r !== debounced)].slice(0, 8);
    setRecent(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const empty = res.data && !res.data.assets.length && !res.data.stacks.length && !res.data.people.length;

  return (
    <div className="px-gutter pt-4">
      <label className="flex h-12 items-center gap-2 rounded-chip border border-border bg-surface px-3 focus-within:border-primary">
        <SearchIcon size={18} className="text-text-muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Stocks, Stacks, people" aria-label="Search" className="h-full flex-1 bg-transparent text-[16px] outline-none" />
        {q && (
          <button onClick={() => setQ("")} aria-label="Clear">
            <X size={18} className="text-text-muted" />
          </button>
        )}
      </label>

      {!debounced ? (
        recent.length ? (
          <section className="mt-6">
            <h2 className="text-section">Recent</h2>
            <ul className="mt-2">
              {recent.map((r) => (
                <li key={r}>
                  <button onClick={() => setQ(r)} className="flex h-12 w-full items-center gap-3 text-left text-[16px] text-text-muted hover:text-text">
                    <Clock size={16} /> {r}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <EmptyState icon={<SearchIcon size={24} />} title="Search StacksClub" body="Find a stock by ticker or company, a Stack by name, or a person by username." />
        )
      ) : res.isLoading ? (
        <div className="mt-4">
          <RowSkeleton count={4} />
        </div>
      ) : empty ? (
        <EmptyState icon={<SearchIcon size={24} />} title={`No results for “${debounced}”`} />
      ) : (
        <div onClick={remember}>
          {!!res.data?.assets.length && (
            <Section title="Stocks">
              {res.data.assets.map((a) => (
                <AssetRow key={a.address} a={a} />
              ))}
            </Section>
          )}
          {!!res.data?.stacks.length && (
            <Section title="Stacks">
              {res.data.stacks.map((s) => (
                <StackRow key={s.id} s={s} />
              ))}
            </Section>
          )}
          {!!res.data?.people.length && (
            <Section title="People">
              {res.data.people.map((p) => (
                <Link key={p.id} href={`/app/u/${p.username}`} className="flex h-row items-center gap-3">
                  <Avatar src={p.avatar_url} name={p.username} size={48} />
                  <div className="min-w-0">
                    <p className="text-row font-semibold">{p.display_name ?? p.username}</p>
                    <p className="truncate text-secondary text-text-muted">@{p.username}</p>
                  </div>
                </Link>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-1 text-section">{title}</h2>
      {children}
    </section>
  );
}

"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Plus, Search, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { DepositSheet } from "@/components/trade/DepositSheet";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ThemeSwitch } from "@/components/ui/ThemeSwitch";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { cn } from "@/lib/cn";
import { price } from "@/lib/format";
import { useApi } from "@/lib/client/api";
import { useMe, usePortfolio } from "@/lib/client/queries";
import type { AssetItem, ProfileLite, StackSummary } from "@/lib/client/types";

/** Desktop top bar (lg): brand, nav, search, balance, Deposit, account menu. */
export function TopBar() {
  const path = usePathname();
  const me = useMe();
  const portfolio = usePortfolio({ poll: 20_000 });
  const [deposit, setDeposit] = useState(false);
  const nav = [
    { href: "/app", label: "Markets", active: path === "/app" || /^\/app\/(stock|stack|club)\//.test(path) },
    { href: "/app/social", label: "Social", active: path.startsWith("/app/social") },
  ];
  return (
    <header className="sticky top-0 z-40 hidden h-16 items-center gap-6 border-b border-border bg-bg/90 px-6 backdrop-blur lg:flex">
      <Link href="/app" className="flex items-center gap-2.5">
        <Wordmark size={22} />
      </Link>
      <nav aria-label="Main" className="flex items-center gap-1">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={n.active ? "page" : undefined}
            className={cn("rounded-chip px-3 py-2 text-[15px] font-medium transition-colors", n.active ? "text-text" : "text-text-muted hover:text-text")}
          >
            {n.label}
          </Link>
        ))}
        <Link href="/app/create" className={cn("flex items-center gap-1.5 rounded-chip px-3 py-2 text-[15px] font-medium transition-colors", path.startsWith("/app/create") ? "text-text" : "text-text-muted hover:text-text")}>
          <Plus size={16} /> Create Stack
        </Link>
      </nav>
      <SearchBox />
      <div className="ml-auto flex items-center gap-5">
        <div className="text-right leading-tight">
          <p className="text-[15px] font-semibold tnum">{portfolio.data ? `${portfolio.data.usdt.display.toFixed(2)}` : "—"}</p>
          <p className="text-[12px] text-text-muted">USDT cash</p>
        </div>
        <Button size="md" className="h-10" onClick={() => setDeposit(true)}>
          Deposit
        </Button>
        {me.data?.profile && <AccountMenu username={me.data.profile.username} avatar={me.data.profile.avatar_url} />}
      </div>
      <DepositSheet open={deposit} onClose={() => setDeposit(false)} />
    </header>
  );
}

function SearchBox() {
  const api = useApi();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const res = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api<{ assets: AssetItem[]; stacks: StackSummary[]; people: ProfileLite[] }>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length > 0,
  });
  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };
  const items = [
    ...(res.data?.assets ?? []).slice(0, 6).map((a) => ({ key: a.address, href: `/app/stock/${a.provider}/${a.address}`, logo: a.logo_url, title: a.ticker, sub: a.name, right: price(a.price?.price_usd ? Number(a.price.price_usd) : null) })),
    ...(res.data?.stacks ?? []).slice(0, 4).map((s) => ({ key: `s${s.id}`, href: `/app/stack/${s.id}`, logo: s.image_url, title: `$${s.ticker}`, sub: s.name, right: "Stack" })),
    ...(res.data?.people ?? []).slice(0, 4).map((p) => ({ key: p.id, href: `/app/u/${p.username}`, logo: p.avatar_url, title: p.display_name ?? p.username, sub: `@${p.username}`, right: "" })),
  ];
  return (
    <div className="relative w-full max-w-[440px]">
      <label className="flex h-10 items-center gap-2 rounded-chip border border-border bg-surface px-3 focus-within:border-primary">
        <Search size={16} className="text-text-muted" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && items[0]) go(items[0].href);
            if (e.key === "Escape") input.current?.blur();
          }}
          placeholder="Search stocks, Stacks, people"
          aria-label="Search"
          className="h-full flex-1 bg-transparent text-[14px] outline-none"
        />
        <kbd className="rounded-md border border-border px-1.5 text-[11px] text-text-muted">⌘K</kbd>
      </label>
      {open && debounced && (
        <div className="absolute inset-x-0 top-12 z-50 max-h-[420px] overflow-y-auto rounded-card border border-border bg-surface p-1.5 shadow-[0_20px_48px_-16px_rgb(0_0_0/0.6)]">
          {res.isLoading ? (
            <p className="px-3 py-4 text-[14px] text-text-muted">Searching…</p>
          ) : !items.length ? (
            <p className="px-3 py-4 text-[14px] text-text-muted">No results for “{debounced}”</p>
          ) : (
            items.map((it) => (
              <button key={it.key} onMouseDown={() => go(it.href)} className="flex w-full items-center gap-3 rounded-chip px-2.5 py-2 text-left hover:bg-surface-2">
                <TokenLogo src={it.logo} label={it.title} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{it.title}</span>
                  <span className="block truncate text-[12px] text-text-muted">{it.sub}</span>
                </span>
                <span className="text-[13px] text-text-muted tnum">{it.right}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AccountMenu({ username, avatar }: { username: string; avatar: string | null }) {
  const [open, setOpen] = useState(false);
  const { logout } = usePrivy();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-label="Account" aria-expanded={open} className="rounded-full ring-2 ring-transparent hover:ring-border">
        <Avatar src={avatar} name={username} size={36} />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[280px] rounded-card border border-border bg-surface p-2 shadow-[0_20px_48px_-16px_rgb(0_0_0/0.6)]">
          <Link href={`/app/u/${username}`} onClick={() => setOpen(false)} className="flex h-11 items-center gap-2.5 rounded-chip px-3 text-[14px] hover:bg-surface-2">
            <User size={16} /> Profile
          </Link>
          <div className="px-3 pb-2 pt-3">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">Appearance</p>
            <ThemeSwitch />
          </div>
          <button
            onClick={async () => {
              await logout();
              router.replace("/");
            }}
            className="flex h-11 w-full items-center gap-2.5 rounded-chip px-3 text-[14px] text-down hover:bg-surface-2"
          >
            <LogOut size={16} /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

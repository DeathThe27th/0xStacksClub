"use client";

import { Home, Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "@/components/brand/Mark";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import { useMe } from "@/lib/client/queries";

/** Desktop navigation (lg and up). Replaces the floating pill. */
export function Sidebar() {
  const path = usePathname();
  const me = useMe();
  const p = me.data?.profile;
  const items = [
    { href: "/app", label: "Home", icon: <Home size={20} />, active: path === "/app" },
    { href: "/app/search", label: "Search", icon: <Search size={20} />, active: path.startsWith("/app/search") },
    { href: "/app/social", label: "Social", icon: <Users size={20} />, active: path.startsWith("/app/social") },
  ];
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] flex-col border-r border-border bg-bg px-4 py-6 lg:flex">
      <Link href="/app" className="flex items-center gap-3 px-2">
        <Mark size={36} />
        <span className="text-[19px] font-bold tracking-[-0.01em]">StacksClub</span>
      </Link>
      <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            aria-current={it.active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-chip px-3 text-[15px] font-medium transition-colors",
              it.active ? "bg-surface-2 text-text" : "text-text-muted hover:bg-surface hover:text-text",
            )}
          >
            {it.icon}
            {it.label}
          </Link>
        ))}
      </nav>
      <Link href="/app/create" className="press mt-5 flex h-11 items-center justify-center gap-2 rounded-cta bg-primary text-[15px] font-semibold text-white hover:bg-primary-press">
        <Plus size={18} /> Create a Stack
      </Link>
      <div className="flex-1" />
      {p && (
        <Link
          href={`/app/u/${p.username}`}
          className={cn(
            "flex items-center gap-3 rounded-chip px-2 py-2 transition-colors hover:bg-surface",
            path.startsWith(`/app/u/${p.username}`) && "bg-surface-2",
          )}
        >
          <Avatar src={p.avatar_url} name={p.username} size={36} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">{p.display_name ?? p.username}</span>
            <span className="block truncate text-[13px] text-text-muted">@{p.username}</span>
          </span>
        </Link>
      )}
    </aside>
  );
}

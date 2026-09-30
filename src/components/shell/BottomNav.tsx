"use client";

import { Home, Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import { useMe } from "@/lib/client/queries";

/**
 * Floating pill nav (UI_SPEC §2): 16px from the sides, 12px above the safe area, 64px tall,
 * surface at 85% with backdrop blur, 1px border. Active item on a surface-2 capsule.
 */
export function BottomNav() {
  const path = usePathname();
  const me = useMe();
  const username = me.data?.profile?.username;
  const items = [
    { href: "/app", label: "Home", icon: <Home size={24} strokeWidth={2} />, active: path === "/app" },
    { href: "/app/search", label: "Search", icon: <Search size={24} strokeWidth={2} />, active: path.startsWith("/app/search") },
    { href: "/app/create", label: "Create basket", icon: <Plus size={26} strokeWidth={2.25} />, active: path.startsWith("/app/create") },
    { href: "/app/social", label: "Social", icon: <Users size={24} strokeWidth={2} />, active: path.startsWith("/app/social") },
    {
      href: username ? `/app/u/${username}` : "/app",
      label: "Profile",
      icon: <Avatar src={me.data?.profile?.avatar_url} name={username ?? "?"} size={28} />,
      // Exact match: `/app/u/ada` must not light up on `/app/u/adam`.
      active: !!username && path === `/app/u/${username}`,
      // Until the profile has loaded there is nowhere to go; don't send the tap to Home.
      pending: !username,
    },
  ];
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 z-40 mx-auto max-w-app px-4 lg:hidden"
      style={{ bottom: "calc(12px + env(safe-area-inset-bottom))" }}
    >
      <ul className="flex h-nav items-center justify-between rounded-full border border-border bg-surface/85 px-2 shadow-[0_16px_40px_-16px_rgb(0_0_0/var(--nav-shadow))] backdrop-blur-xl">
        {items.map((it) => (
          <li key={it.label} className="min-w-0 flex-1">
            <Link
              href={it.href}
              aria-label={it.label}
              aria-current={it.active ? "page" : undefined}
              aria-disabled={"pending" in it && it.pending ? true : undefined}
              onClick={"pending" in it && it.pending ? (e) => e.preventDefault() : undefined}
              className={cn(
                // Capped at 60px, but free to shrink so five items still fit a 320px phone.
                "press mx-auto grid h-12 w-full max-w-[60px] place-items-center rounded-full transition-colors",
                it.active ? "bg-surface-2 text-text shadow-[inset_0_1px_8px_rgb(var(--text)/0.06)]" : "text-text-muted hover:text-text",
              )}
            >
              {it.icon}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

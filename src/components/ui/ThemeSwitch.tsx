"use client";

import { Gem, Monitor, Moon, Rainbow, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTheme, type ThemeChoice } from "@/lib/client/theme";

/** Light / Dark / Rainbow / Binance / System segmented control. */
export function ThemeSwitch({ className }: { className?: string }) {
  const { choice, set } = useTheme();
  const opts: { id: ThemeChoice; label: string; icon: React.ReactNode }[] = [
    { id: "light", label: "Light", icon: <Sun size={16} /> },
    { id: "dark", label: "Dark", icon: <Moon size={16} /> },
    { id: "rainbow", label: "Rainbow", icon: <Rainbow size={16} /> },
    { id: "binance", label: "Binance", icon: <Gem size={16} /> },
    { id: "system", label: "System", icon: <Monitor size={16} /> },
  ];
  return (
    <div role="radiogroup" aria-label="Appearance" className={cn("grid grid-cols-5 rounded-chip bg-surface-2 p-1", className)}>
      {opts.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={choice === o.id}
          onClick={() => set(o.id)}
          className={cn(
            "flex h-14 flex-col items-center justify-center gap-1 rounded-[10px] text-[11px] font-semibold transition-colors",
            choice === o.id ? "bg-bg text-text shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-text-muted hover:text-text",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

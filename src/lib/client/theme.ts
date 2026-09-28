"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type ThemeChoice = "system" | "light" | "dark" | "rainbow";
export type ResolvedTheme = "light" | "dark" | "rainbow";
import { THEME_KEY as KEY } from "@/lib/theme-script";
const EVENT = "stacksclub:theme";

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "rainbow" ? v : "system";
  } catch {
    return "system";
  }
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice !== "system") return choice;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function apply(choice: ThemeChoice) {
  document.documentElement.dataset.theme = resolve(choice);
  window.dispatchEvent(new Event(EVENT));
}

/** Current choice and resolved theme; `set` persists and applies. Follows the device on "system". */
export function useTheme() {
  const choice = useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(EVENT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    readChoice,
    () => "system" as ThemeChoice,
  );
  const resolved = useSyncExternalStore<ResolvedTheme>(
    (cb) => {
      const m = window.matchMedia("(prefers-color-scheme: light)");
      const obs = new MutationObserver(cb);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      m.addEventListener("change", cb);
      return () => {
        obs.disconnect();
        m.removeEventListener("change", cb);
      };
    },
    () => {
      const t = document.documentElement.dataset.theme;
      return t === "light" || t === "rainbow" ? t : "dark";
    },
    () => "dark" as const,
  );

  // Keep following the device while on "system".
  useEffect(() => {
    if (choice !== "system") return;
    const m = window.matchMedia("(prefers-color-scheme: light)");
    const on = () => apply("system");
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [choice]);

  const set = useCallback((c: ThemeChoice) => {
    try {
      localStorage.setItem(KEY, c);
    } catch {
      /* storage unavailable: still apply for this session */
    }
    apply(c);
  }, []);

  return { choice, resolved, set };
}

/** Reads a theme colour token as a CSS colour string, for canvas-based UI like the chart. */
export function cssColor(token: string, alpha = 1): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim().split(/\s+/).join(", ");
  return alpha === 1 ? `rgb(${v})` : `rgba(${v}, ${alpha})`;
}

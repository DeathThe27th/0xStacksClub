"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type ThemeChoice = "system" | "light" | "dark" | "rainbow" | "binance";
export type ResolvedTheme = "light" | "dark" | "rainbow" | "binance";
import { THEME_KEY as KEY } from "@/lib/theme-script";
const EVENT = "stacksclub:theme";

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    // Light until the visitor picks something else; "system" follows the device.
    return v === "light" || v === "dark" || v === "rainbow" || v === "binance" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice !== "system") return choice;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.themeLock ?? resolve(choice);
  syncThemeColor();
  window.dispatchEvent(new Event(EVENT));
}

/** Points the browser chrome (theme-color) at the page's own background. */
export function syncThemeColor() {
  const bg = getComputedStyle(document.documentElement).backgroundColor;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.removeAttribute("media");
    m.content = bg;
  });
}

/**
 * Holds the page in one theme while mounted (the landing is always light), whatever the visitor
 * chose, and puts their own theme back on the way out. The boot script sets the same lock before
 * first paint on routes listed in THEME_LOCKS, so there is no flash.
 */
export function useThemeLock(theme: ResolvedTheme) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.themeLock = theme;
    root.dataset.theme = theme;
    syncThemeColor();
    return () => {
      delete root.dataset.themeLock;
      apply(readChoice());
    };
  }, [theme]);
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
    () => "light" as ThemeChoice,
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
      return t === "dark" || t === "rainbow" || t === "binance" ? t : "light";
    },
    () => "light" as const,
  );

  // Match the browser chrome on first load, then keep following the device while on "system".
  useEffect(syncThemeColor, []);
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

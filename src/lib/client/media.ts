"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";

/** True on desktop widths (Tailwind `lg`). Server render assumes mobile. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(QUERY);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

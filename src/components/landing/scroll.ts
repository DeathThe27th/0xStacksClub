"use client";

import { useMotionValue } from "framer-motion";
import { useEffect } from "react";

/**
 * 0 to 1 as a section scrolls through the viewport: 0 when its top reaches `from` (a fraction of
 * the screen height from the top), 1 when its bottom reaches `to`. The defaults span the time a
 * sticky stage inside a tall section is pinned.
 *
 * Measured with getBoundingClientRect, which stays right under the desktop's 80% zoom where
 * framer-motion's useScroll did not (and its native ScrollTimeline path also reset values once a
 * section was scrolled past).
 */
export function useScrollProgress(ref: React.RefObject<HTMLElement | null>, from = 0, to = 1) {
  const v = useMotionValue(0);
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const travel = r.height + (from - to) * vh;
      v.set(travel > 0 ? Math.min(1, Math.max(0, (from * vh - r.top) / travel)) : 0);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [ref, v, from, to]);
  return v;
}

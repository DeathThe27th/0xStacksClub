"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** Quick 200ms count between values (UI_SPEC §9). */
export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => React.ReactNode }) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || prev.current === value) {
      setShown(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, { duration: 0.2, ease: "easeOut", onUpdate: setShown });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduce]);
  return <>{format(shown)}</>;
}

/** Brief 150ms tint when a value changes (UI_SPEC §3.6). */
export function useFlash(value: number | null | undefined): string {
  const prev = useRef(value);
  const [cls, setCls] = useState("");
  useEffect(() => {
    if (value === null || value === undefined || prev.current === null || prev.current === undefined || value === prev.current) {
      prev.current = value;
      return;
    }
    setCls(value > prev.current ? "animate-flash-up" : "animate-flash-down");
    prev.current = value;
    const t = setTimeout(() => setCls(""), 200);
    return () => clearTimeout(t);
  }, [value]);
  return cls;
}

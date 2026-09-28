"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import { createContext, useCallback, useContext, useState } from "react";

type Toast = { id: number; title: string; body?: string; tone?: "default" | "up" | "down" };
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

/** Drops from the top in a surface card with the mark; auto-hides after 4s (UI_SPEC §3.7). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((xs) => [...xs.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] mx-auto flex max-w-app flex-col gap-2 px-gutter pt-[calc(env(safe-area-inset-top)+8px)] lg:left-auto lg:right-6 lg:top-4 lg:mx-0 lg:w-[380px] lg:px-0" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ y: -80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -80, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 36 }}
              className="pointer-events-auto flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.8)]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-text">
                <Bell size={16} strokeWidth={2.25} />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[15px] font-semibold ${t.tone === "up" ? "text-up" : t.tone === "down" ? "text-down" : "text-text"}`}>{t.title}</p>
                {t.body && <p className="truncate text-secondary text-text-muted">{t.body}</p>}
              </div>
              <span className="text-[12px] text-text-muted">now</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

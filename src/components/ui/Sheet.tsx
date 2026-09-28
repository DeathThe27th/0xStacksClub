"use client";

import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useIsDesktop } from "@/lib/client/media";

/**
 * Bottom sheet (UI_SPEC §6.1): spring (stiffness 400, damping 40), black/60 backdrop, surface,
 * 24px top radius, 36x4 grabber, centered 20/600 title, drag down to dismiss.
 *
 * Portaled to <body>: callers sit inside the blurred top bar (backdrop-filter makes it the
 * containing block for fixed children) and the sticky market pane (its own stacking context),
 * which would otherwise pin the sheet to the header or tuck it under the chart.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  className,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  dismissable?: boolean;
}) {
  const drag = useDragControls();
  const desktop = useIsDesktop();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismissable && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, dismissable]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => dismissable && onClose()}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : undefined}
            className={cn(
              desktop
                ? "absolute left-1/2 top-1/2 flex max-h-[calc(86dvh/var(--app-zoom))] w-[460px] flex-col rounded-sheet border border-border bg-surface shadow-[0_24px_64px_-16px_rgba(0,0,0,0.9)]"
                : "absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] max-w-app flex-col rounded-t-sheet border-t border-border bg-surface pb-safe",
              className,
            )}
            initial={desktop ? { opacity: 0, scale: 0.96, x: "-50%", y: "-48%" } : { y: "100%" }}
            animate={desktop ? { opacity: 1, scale: 1, x: "-50%", y: "-50%" } : { y: 0 }}
            exit={desktop ? { opacity: 0, scale: 0.96, x: "-50%", y: "-48%" } : { y: "100%" }}
            transition={desktop ? { duration: 0.18, ease: [0.16, 1, 0.3, 1] } : { type: "spring", stiffness: 400, damping: 40 }}
            drag={dismissable && !desktop ? "y" : false}
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            {desktop ? (
              <div className="h-5" />
            ) : (
              <div className="flex cursor-grab touch-none justify-center pb-2 pt-3" onPointerDown={(e) => dismissable && drag.start(e)}>
                <span className="h-1 w-9 rounded-full bg-text-dim" />
              </div>
            )}
            {title && <h2 className="px-gutter pb-4 text-center text-sheet-title">{title}</h2>}
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-gutter pb-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

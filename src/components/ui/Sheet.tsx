"use client";

import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { useEffect, useRef, useState } from "react";
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
 *
 * Desktop: a centered dialog. The overlay is sized from dvh/vw divided by --app-zoom (like the
 * market pane) because `inset-0` doesn't follow the 80% html zoom, which pushed the dialog's top
 * off screen. With `anchor`, desktop instead shows a dropdown under the trigger; the caller wraps
 * trigger and sheet in a `relative` element.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  className,
  dismissable = true,
  anchor,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  dismissable?: boolean;
  anchor?: "left" | "right";
}) {
  const drag = useDragControls();
  const desktop = useIsDesktop();
  const popover = desktop && !!anchor;
  const [mounted, setMounted] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismissable && onClose();
    window.addEventListener("keydown", onKey);
    if (popover) {
      // Outside means outside the caller's wrapper, so the trigger can toggle.
      const onDown = (e: MouseEvent) => {
        const scope = popRef.current?.parentElement;
        if (dismissable && scope && !scope.contains(e.target as Node)) onClose();
      };
      window.addEventListener("mousedown", onDown);
      return () => {
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("mousedown", onDown);
      };
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, dismissable, popover]);

  if (popover) {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            ref={popRef}
            role="dialog"
            aria-label={typeof title === "string" ? title : undefined}
            className={cn(
              "absolute top-full z-50 mt-2 flex max-h-[calc(80dvh/var(--app-zoom))] w-[360px] flex-col rounded-card border border-border bg-surface shadow-[0_20px_48px_-16px_rgb(0_0_0/0.6)]",
              anchor === "right" ? "right-0" : "left-0",
              className,
            )}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          >
            {title && <h2 className="px-4 pb-2 pt-4 text-[16px] font-semibold">{title}</h2>}
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className={cn(
            "fixed left-0 top-0 z-50",
            desktop ? "flex h-[calc(100dvh/var(--app-zoom))] w-[calc(100vw/var(--app-zoom))] items-center justify-center p-8" : "inset-0",
          )}
        >
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
                ? "relative flex max-h-full w-[460px] flex-col rounded-sheet border border-border bg-surface shadow-[0_24px_64px_-16px_rgba(0,0,0,0.9)]"
                : "absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] max-w-app flex-col rounded-t-sheet border-t border-border bg-surface pb-safe",
              className,
            )}
            initial={desktop ? { opacity: 0, scale: 0.97 } : { y: "100%" }}
            animate={desktop ? { opacity: 1, scale: 1 } : { y: 0 }}
            exit={desktop ? { opacity: 0, scale: 0.97 } : { y: "100%" }}
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
              <div className="h-5 shrink-0" />
            ) : (
              <div className="flex cursor-grab touch-none justify-center pb-2 pt-3" onPointerDown={(e) => dismissable && drag.start(e)}>
                <span className="h-1 w-9 rounded-full bg-text-dim" />
              </div>
            )}
            {title && <h2 className="shrink-0 px-gutter pb-4 text-center text-sheet-title">{title}</h2>}
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-gutter pb-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

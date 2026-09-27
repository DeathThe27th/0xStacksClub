"use client";

import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { useEffect } from "react";
import { cn } from "@/lib/cn";

/**
 * Bottom sheet (UI_SPEC §6.1): spring (stiffness 400, damping 40), black/60 backdrop, surface,
 * 24px top radius, 36x4 grabber, centered 20/600 title, drag down to dismiss.
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

  return (
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
              "absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] max-w-app flex-col rounded-t-sheet border-t border-border bg-surface pb-safe",
              className,
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 40 }}
            drag={dismissable ? "y" : false}
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            <div className="flex cursor-grab touch-none justify-center pb-2 pt-3" onPointerDown={(e) => dismissable && drag.start(e)}>
              <span className="h-1 w-9 rounded-full bg-text-dim" />
            </div>
            {title && <h2 className="px-gutter pb-4 text-center text-sheet-title">{title}</h2>}
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-gutter pb-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

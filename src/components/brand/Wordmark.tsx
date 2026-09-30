import { cn } from "@/lib/cn";
import { APP_NAME } from "@/lib/constants";

/** App wordmark: type only, set in the display face, tinted with currentColor. */
/** `size` is px, or any CSS length (the landing page passes a clamp()). */
export function Wordmark({ size = 22, className }: { size?: number | string; className?: string }) {
  return (
    <span
      role="img"
      aria-label={APP_NAME}
      className={cn("inline-block select-none whitespace-nowrap font-display font-extrabold leading-none tracking-[-0.04em]", className)}
      style={{ fontSize: size }}
    >
      {APP_NAME}
    </span>
  );
}

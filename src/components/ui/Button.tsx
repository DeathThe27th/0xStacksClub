import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; loading?: boolean; size?: "lg" | "md" };

/** Flat pill buttons: primary, secondary and ghost. 56px or 44px tall. */
export function Button({ variant = "primary", loading, size = "lg", className, children, disabled, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold disabled:cursor-not-allowed",
        // A loading button stays at full strength: it's working, not unavailable.
        loading ? "disabled:cursor-progress" : "disabled:opacity-50",
        size === "lg" ? "h-14 px-6 text-[17px]" : "h-11 px-4 text-[15px]",
        variant === "primary" && "press bg-primary text-on-primary transition-colors hover:bg-primary-press",
        variant === "secondary" && "press border border-border bg-surface-2 text-text transition-colors hover:bg-border/70",
        variant === "ghost" && "press text-text-muted hover:text-text",
        className,
      )}
    >
      {loading && <Loader2 size={18} className="animate-spin" />}
      {children}
    </button>
  );
}

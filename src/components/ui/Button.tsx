import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; loading?: boolean; size?: "lg" | "md" };

/** CTA: 56px, radius 14, 17/600 (UI_SPEC §3.2, §4.5). Pressed scales to 0.97. */
export function Button({ variant = "primary", loading, size = "lg", className, children, disabled, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "press inline-flex items-center justify-center gap-2 rounded-cta font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "lg" ? "h-14 px-6 text-[17px]" : "h-11 px-4 text-[15px]",
        variant === "primary" && "bg-primary text-white hover:bg-primary-press active:bg-primary-press",
        variant === "secondary" && "bg-surface-2 text-text hover:bg-border",
        variant === "ghost" && "text-text-muted hover:text-text",
        className,
      )}
    >
      {loading && <Loader2 size={18} className="animate-spin" />}
      {children}
    </button>
  );
}

import type { SVGProps } from "react";

/**
 * StacksClub mark: three offset slabs forming a stack. Original artwork; uses currentColor.
 */
export function Mark({ size = 32, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="StacksClub"
      {...props}
    >
      <rect x="9" y="3" width="20" height="7" rx="3.5" fill="currentColor" opacity="0.45" />
      <rect x="6" y="12.5" width="20" height="7" rx="3.5" fill="currentColor" opacity="0.72" />
      <rect x="3" y="22" width="20" height="7" rx="3.5" fill="currentColor" />
    </svg>
  );
}

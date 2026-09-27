import { useId, type SVGProps } from "react";

/**
 * StacksClub mark: a liquid S made of two mirrored drops (two stacked "drops" = S for Stacks).
 * Original artwork; direction from docs/reference/logo-direction.jpg (squircle, liquid, navy on
 * periwinkle).
 *
 * - `tile`: the full-colour squircle icon (header, landing, favicon).
 * - `glyph`: the S alone in currentColor, for nav icons that tint with state.
 */
const DROP = "M63 14 C49 13 31 22 27 38 C24.5 48 30 57 39 57.5 C46 58 49.5 52.5 49.5 45 C49.5 33 55 22 63 14 Z";
const PLACE = "translate(50 50) scale(1.12) translate(-50 -50) translate(3 3)";

function S() {
  return (
    <>
      <path d={DROP} transform={PLACE} />
      <path d={DROP} transform={`rotate(180 50 50) ${PLACE}`} />
    </>
  );
}

export function Mark({
  size = 32,
  variant = "tile",
  ...props
}: SVGProps<SVGSVGElement> & { size?: number; variant?: "tile" | "glyph" }) {
  const id = useId().replace(/:/g, "");
  if (variant === "glyph") {
    return (
      <svg width={size} height={size} viewBox="12 8 76 84" fill="currentColor" role="img" aria-label="StacksClub" {...props}>
        <S />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="StacksClub" {...props}>
      <defs>
        <linearGradient id={`f${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E2E3FF" />
          <stop offset=".55" stopColor="#AEB2F9" />
          <stop offset="1" stopColor="#7E83EF" />
        </linearGradient>
        <radialGradient id={`s${id}`} cx=".3" cy=".16" r=".5">
          <stop offset="0" stopColor="#fff" stopOpacity=".7" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`c${id}`}>
          <rect x="4" y="4" width="92" height="92" rx="26" />
        </clipPath>
      </defs>
      <rect x="2" y="3" width="96" height="96" rx="28" fill="#070A2E" />
      <g clipPath={`url(#c${id})`}>
        <rect x="4" y="4" width="92" height="92" fill={`url(#f${id})`} />
        <rect x="4" y="4" width="92" height="92" fill={`url(#s${id})`} />
        <g fill="#0B0F3F">
          <S />
        </g>
      </g>
      <rect x="4.6" y="4.6" width="90.8" height="90.8" rx="25.4" fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth="1.1" />
    </svg>
  );
}

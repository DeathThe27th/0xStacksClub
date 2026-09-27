import { useId, type SVGProps } from "react";

/**
 * StacksClub mark: a white tilted squircle holding three stepped bars, a literal stack.
 * Original artwork; direction from docs/reference/logo-direction-2.jpg (bold white shape on
 * #0043FE).
 *
 * - `tile`: the blue app icon (header, landing, favicon).
 * - `glyph`: the tilted squircle in currentColor with the bars cut out, for nav icons that tint
 *   with state and sit on black or white.
 */

const BARS = [
  { x: 33, y: 31 },
  { x: 37, y: 45.5 },
  { x: 41, y: 60 },
];

function Bars({ fill }: { fill: string }) {
  return (
    <g transform="rotate(-14 50 50)" fill={fill}>
      {BARS.map((b) => (
        <rect key={b.y} x={b.x} y={b.y} width="26" height="9" rx="4.5" />
      ))}
    </g>
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
      <svg width={size} height={size} viewBox="12 12 76 76" role="img" aria-label="StacksClub" {...props}>
        <defs>
          <mask id={`m${id}`}>
            <rect x="0" y="0" width="100" height="100" fill="#fff" />
            <Bars fill="#000" />
          </mask>
        </defs>
        <rect x="18" y="18" width="64" height="64" rx="22" transform="rotate(-14 50 50)" fill="currentColor" mask={`url(#m${id})`} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="StacksClub" {...props}>
      <rect width="100" height="100" rx="24" fill="#0043FE" />
      <rect x="18" y="18" width="64" height="64" rx="22" transform="rotate(-14 50 50)" fill="#fff" />
      <Bars fill="#0043FE" />
    </svg>
  );
}

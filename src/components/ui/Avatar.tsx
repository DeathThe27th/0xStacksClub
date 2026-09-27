/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/cn";

const hues = ["#3D5AFE", "#22C55E", "#F5A524", "#FF4430", "#A855F7", "#06B6D4"];

/** Round avatar; falls back to the username initial on a hue derived from the name. */
export function Avatar({ src, name, size = 40, className }: { src?: string | null; name?: string | null; size?: number; className?: string }) {
  const n = name ?? "?";
  const hue = hues[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % hues.length];
  if (src) {
    return <img src={src} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, background: hue, fontSize: size * 0.42 }}
    >
      {n.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AvatarStack({ people, extra }: { people: { id: string; username: string; avatar_url: string | null }[]; extra: number }) {
  if (!people.length) return null;
  return (
    <span className="ml-1.5 inline-flex items-center">
      {people.slice(0, 3).map((p, i) => (
        <Avatar key={p.id} src={p.avatar_url} name={p.username} size={20} className={cn("ring-2 ring-bg", i > 0 && "-ml-1.5")} />
      ))}
      {extra > 0 && <span className="-ml-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-text-muted ring-2 ring-bg">{extra}+</span>}
    </span>
  );
}

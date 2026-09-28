// Telegram club links. Only t.me / telegram.me group links are accepted, normalised to https://t.me/.

// Public username: 5 to 32 chars, letters, digits and underscores, starting with a letter.
const USERNAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
// Invite hash after "+" or "joinchat/".
const INVITE = /^[A-Za-z0-9_-]{8,64}$/;
const HOSTS = new Set(["t.me", "telegram.me", "www.t.me", "www.telegram.me"]);

/** Returns the canonical https://t.me/... link, or null if it isn't a Telegram group link. */
export function normalizeTelegramUrl(input: string): string | null {
  let raw = input.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port || url.search || url.hash) return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 1) {
    const p = parts[0]!;
    if (p.startsWith("+") && INVITE.test(p.slice(1))) return `https://t.me/${p}`;
    if (USERNAME.test(p)) return `https://t.me/${p}`;
  }
  if (parts.length === 2 && parts[0] === "joinchat" && INVITE.test(parts[1]!)) return `https://t.me/+${parts[1]}`;
  return null;
}

export const TELEGRAM_URL_ERROR = "Enter a Telegram group link, like t.me/yourgroup or t.me/+invite";

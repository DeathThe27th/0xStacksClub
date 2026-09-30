// Finds the basket a person means from free text ("ai kings", "$AIK", "semis"). Used by the
// iMessage bot routes. Pure, so it's unit tested.

export type BasketName = { id: number; name: string; ticker: string };

export type BasketMatch<T extends BasketName> =
  | { kind: "one"; basket: T }
  | { kind: "many"; options: T[] }
  | { kind: "none" };

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** Typos allowed for a word of this length. Short words must match exactly. */
function slack(len: number): number {
  return len >= 8 ? 2 : len >= 4 ? 1 : 0;
}

function close(a: string, b: string): boolean {
  const allowed = slack(Math.min(a.length, b.length));
  return allowed > 0 && Math.abs(a.length - b.length) <= allowed && editDistance(a, b) <= allowed;
}

/** 0 = no match. Higher tiers are stronger; only the top tier is returned. */
function score(query: string, b: BasketName): number {
  const name = norm(b.name);
  const ticker = norm(b.ticker);
  if (query === ticker || query === name) return 5;
  if (name.startsWith(query) || (query.length >= 2 && ticker.startsWith(query))) return 4;
  const qTokens = query.split(" ");
  const nTokens = name.split(" ");
  if (qTokens.every((q) => nTokens.some((n) => n.startsWith(q)))) return 3;
  if (query.length >= 3 && name.includes(query)) return 2;
  if (close(query, ticker) || close(query, name) || qTokens.every((q) => nTokens.some((n) => n === q || close(q, n)))) return 1;
  return 0;
}

const MAX_OPTIONS = 4;

/** One clear winner, a short list to choose from, or nothing. Never guesses between equals. */
export function matchBasket<T extends BasketName>(input: string, baskets: readonly T[]): BasketMatch<T> {
  const query = norm(input.replace(/\b(the|basket|baskets)\b/gi, " "));
  if (!query) return { kind: "none" };
  const scored = baskets.map((b) => ({ b, s: score(query, b) })).filter((x) => x.s > 0);
  if (!scored.length) return { kind: "none" };
  const top = Math.max(...scored.map((x) => x.s));
  const best = scored.filter((x) => x.s === top).map((x) => x.b);
  if (best.length === 1) return { kind: "one", basket: best[0]! };
  return { kind: "many", options: best.slice(0, MAX_OPTIONS) };
}

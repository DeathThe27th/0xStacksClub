/**
 * Countries and regions Binance Web3 API refuses for both client and server IPs
 * (docs/binance-notes.md §1). Japan is conditional and treated as blocked.
 */
export const RESTRICTED_COUNTRIES = new Set([
  "US", "GU", "MP", "PR", "VI", "AS", "UM", "CA", "NL", "IR", "CU", "KP", "GB", "JP",
]);
/** Ukrainian regions (ISO 3166-2 subdivision codes as Vercel reports them). */
export const RESTRICTED_UA_REGIONS = new Set(["43", "14", "09"]); // Crimea, Donetsk, Luhansk

export function isRestricted(country?: string | null, region?: string | null): boolean {
  if (!country) return false;
  const c = country.toUpperCase();
  if (RESTRICTED_COUNTRIES.has(c)) return true;
  return c === "UA" && !!region && RESTRICTED_UA_REGIONS.has(region);
}

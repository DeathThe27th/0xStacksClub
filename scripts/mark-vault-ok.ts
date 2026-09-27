/**
 * pnpm tsx scripts/mark-vault-ok.ts
 *
 * Runs the per-token BSC fork test (needs BSC_RPC_URL) and records the result in Supabase:
 * vault_ok = true for every token that round-tripped through the vault, false for any the test
 * names as incompatible. can_trade/can_stack become true only when vault_ok and a USDT route exist.
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getAddress } from "viem";

const root = join(__dirname, "..");
const forge = process.env.FORGE_BIN ?? "forge";
const run = spawnSync(forge, ["test", "--match-test", "test_fork_everyTokenRoundTrip", "-vv", "--compute-units-per-second", "300"], {
  cwd: join(root, "contracts"),
  encoding: "utf8",
  env: process.env,
  maxBuffer: 64 * 1024 * 1024,
});
const out = `${run.stdout}\n${run.stderr}`;
if (/\[SKIP\]/.test(out)) {
  console.error("Fork test skipped: set BSC_RPC_URL");
  process.exit(1);
}

const ok = [...out.matchAll(/VAULT OK \S+ \S+ (0x[0-9a-fA-F]{40})/g)].map((m) => getAddress(m[1]!));
const bad = [...out.matchAll(/\n\s+\S+ \(\w+\) (0x[0-9a-fA-F]{40}) (?:prepare|round trip):/g)].map((m) => getAddress(m[1]!));
console.log(`fork test: ${ok.length} ok, ${bad.length} incompatible`);
if (ok.length === 0 && bad.length === 0) {
  console.error(out.slice(-3000));
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const routeOk = (r: string | null) => !!r && /^(RFQ|SWAP)(\+(RFQ|SWAP))?$/.test(r);
  const { data: rows, error } = await sb.from("assets").select("address, route_check");
  if (error) throw error;
  for (const r of rows ?? []) {
    const addr = getAddress(r.address);
    const vaultOk = ok.includes(addr) ? true : bad.includes(addr) ? false : null;
    if (vaultOk === null) continue;
    const tradable = vaultOk && routeOk(r.route_check);
    const { error: e } = await sb
      .from("assets")
      .update({ vault_ok: vaultOk, can_trade: tradable, can_stack: tradable })
      .eq("address", r.address);
    if (e) throw e;
  }
  console.log("assets updated");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

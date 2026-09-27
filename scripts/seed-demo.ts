/**
 * pnpm seed:demo [--clean]
 *
 * LOCAL TESTING ONLY. Inserts clearly labelled demo profiles (username demo_*, privy_id "demo:*",
 * placeholder wallets) and comments marked is_demo = true, so feeds and comment UIs have content.
 * No prices, holders, trades or balances are faked. --clean removes everything this script made.
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY. Refuses to run with NODE_ENV=production.
 */
import { createClient } from "@supabase/supabase-js";

if (process.env.NODE_ENV === "production") {
  console.error("seed:demo is for local testing only.");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const people = [
  { username: "demo_ada", display_name: "Ada (demo)", bio: "Demo account for local testing." },
  { username: "demo_grace", display_name: "Grace (demo)", bio: "Demo account for local testing." },
  { username: "demo_linus", display_name: "Linus (demo)", bio: "Demo account for local testing." },
];
const lines = [
  "Demo comment: watching this one into earnings.",
  "Demo comment: bStocks and Ondo prices are close today.",
  "Demo comment: nice mix, curious how it holds up.",
];

async function main() {
  const { data: existing } = await sb.from("profiles").select("id").like("privy_id", "demo:%");
  if (process.argv.includes("--clean")) {
    await sb.from("profiles").delete().like("privy_id", "demo:%");
    console.log(`removed ${existing?.length ?? 0} demo profiles (and their comments)`);
    return;
  }

  const rows = people.map((p, i) => ({
    ...p,
    privy_id: `demo:${p.username}`,
    // Placeholder addresses in a range no real key controls.
    wallet_address: `0x00000000000000000000000000000000000de${String(i).padStart(3, "0")}`,
  }));
  const { data: profiles, error } = await sb.from("profiles").upsert(rows, { onConflict: "privy_id" }).select("id, username");
  if (error) throw error;

  const { data: assets } = await sb.from("assets").select("address").eq("can_trade", true).limit(3);
  const { data: stacks } = await sb.from("stacks").select("id").limit(2);
  const targets = [
    ...(assets ?? []).map((a) => ({ target_type: "asset", target_id: a.address })),
    ...(stacks ?? []).map((s) => ({ target_type: "stack", target_id: String(s.id) })),
  ];
  const comments = targets.flatMap((t, i) =>
    (profiles ?? []).slice(0, 2).map((p, j) => ({ ...t, profile_id: p.id, body: lines[(i + j) % lines.length], is_demo: true })),
  );
  if (comments.length) {
    const { error: e } = await sb.from("comments").insert(comments);
    if (e) throw e;
  }
  console.log(`demo profiles: ${profiles?.map((p) => p.username).join(", ")}; demo comments: ${comments.length}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

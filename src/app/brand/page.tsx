/* Temporary brand review page: pick a font pairing and wordmark. Remove once chosen. */

const OPTIONS = [
  {
    id: "A",
    name: "Geist",
    note: "Clean and exact. Vercel's face; superb numbers. Calm, pro terminal feel.",
    display: "'Geist', sans-serif",
    ui: "'Geist', sans-serif",
    displayWeight: 700,
    tracking: "-0.045em",
  },
  {
    id: "B",
    name: "Bricolage Grotesque + Geist",
    note: "Characterful display with ink-trap quirks for the wordmark and headings; Geist for UI and numbers.",
    display: "'Bricolage Grotesque', sans-serif",
    ui: "'Geist', sans-serif",
    displayWeight: 800,
    tracking: "-0.04em",
  },
  {
    id: "C",
    name: "Plus Jakarta Sans",
    note: "Rounded and friendly, very readable. Consumer fintech energy.",
    display: "'Plus Jakarta Sans', sans-serif",
    ui: "'Plus Jakarta Sans', sans-serif",
    displayWeight: 800,
    tracking: "-0.04em",
  },
  {
    id: "D",
    name: "Unbounded + Geist",
    note: "Wide, loud display for the wordmark; Geist keeps the app itself calm.",
    display: "'Unbounded', sans-serif",
    ui: "'Geist', sans-serif",
    displayWeight: 700,
    tracking: "-0.03em",
  },
] as const;

const FONTS =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Unbounded:wght@600;700&display=swap";

function Panel({ o, theme }: { o: (typeof OPTIONS)[number]; theme: "dark" | "light" }) {
  const dark = theme === "dark";
  const c = dark
    ? { bg: "#000", surface: "#0E0E10", border: "#26262A", text: "#fff", muted: "#96969E", up: "#22C55E" }
    : { bg: "#fff", surface: "#F5F6F8", border: "#E2E4E9", text: "#0A0A0C", muted: "#626671", up: "#16A34A" };
  return (
    <div style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 24, padding: 24, fontFamily: o.ui }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={{ fontFamily: o.display, fontWeight: o.displayWeight, fontSize: 40, letterSpacing: o.tracking, lineHeight: 1 }}>
          Stacks<span style={{ color: "#0043FE" }}>Club</span>
        </span>
        <span style={{ fontFamily: o.display, fontWeight: o.displayWeight, fontSize: 40, letterSpacing: o.tracking, lineHeight: 1 }}>
          stacksclub<span style={{ color: "#0043FE" }}>.</span>
        </span>
      </div>
      <p style={{ fontFamily: o.display, fontWeight: o.displayWeight, fontSize: 26, letterSpacing: o.tracking, lineHeight: 1.1, marginTop: 22 }}>
        Stocks, onchain. Build and share your own Stacks.
      </p>
      <div style={{ marginTop: 20, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 36, height: 36, borderRadius: 99, background: "#76B900" }} />
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontWeight: 600, fontSize: 16 }}>NVDA</span>
          <span style={{ display: "block", color: c.muted, fontSize: 13 }}>$4.46T MC</span>
        </span>
        <span style={{ textAlign: "right", fontFeatureSettings: "'tnum'" }}>
          <span style={{ display: "block", fontWeight: 500, fontSize: 16 }}>$185.20</span>
          <span style={{ display: "block", color: c.up, fontSize: 13, fontWeight: 500 }}>▲ 1.24%</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <span
          className="pop"
          style={{ flex: 1, height: 48, borderRadius: 999, background: "#0043FE", color: "#fff", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 16 }}
        >
          Buy
        </span>
        <span
          className="pop-soft"
          style={{ flex: 1, height: 48, borderRadius: 999, background: c.surface, border: `1px solid ${c.border}`, display: "grid", placeItems: "center", fontWeight: 600, fontSize: 16 }}
        >
          Compare
        </span>
      </div>
      <p style={{ marginTop: 16, fontSize: 36, fontWeight: 700, letterSpacing: "-0.03em", fontFeatureSettings: "'tnum'" }}>
        $12,480<span style={{ color: c.muted }}>.37</span>
      </p>
    </div>
  );
}

export default function BrandPage() {
  return (
    <main style={{ background: "#111114", minHeight: "100dvh", padding: "32px 16px 64px", color: "#fff" }}>
      <link rel="stylesheet" href={FONTS} />
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Pick a font pairing and wordmark</h1>
        <p style={{ color: "#96969E", marginTop: 6 }}>Each option shows two wordmark treatments, a headline, a list row, the new buttons and a balance, in dark and light.</p>
        {OPTIONS.map((o) => (
          <section key={o.id} style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>
              {o.id}. {o.name}
            </h2>
            <p style={{ color: "#96969E", marginTop: 4, fontSize: 14 }}>{o.note}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 14 }}>
              <Panel o={o} theme="dark" />
              <Panel o={o} theme="light" />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

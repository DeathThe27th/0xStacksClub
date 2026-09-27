# One-shot prompt

Paste everything below the line into Claude Code from the repo root, after the files are in place:

```
CLAUDE.md
docs/ARCHITECTURE.md
docs/UI_SPEC.md
docs/CONTRACTS.md
docs/BACKEND.md
docs/FLOWS.md
docs/ONESHOT_PROMPT.md
docs/reference/ (optional: screenshots of the reference UI)
```

Before running it, fill `.env.local` with your real keys and export `BSC_RPC_URL` in the Codespace so the fork tests can run.

---

Build StacksClub end to end in this repo.

Read `CLAUDE.md` first, then every file in `docs/` in full, including any images in `docs/reference/`. Those docs are the spec. Follow the build order in `CLAUDE.md` and commit after each numbered step.

Rules for this run:

1. Before writing the Binance client, fetch and read the Binance docs listed in `docs/BACKEND.md`, then write `docs/binance-notes.md` with the exact endpoints, params, auth scheme and sample responses you will use. Do not invent anything the docs don't say.
2. Build the contracts and run `forge test`. Run the fork test with `BSC_RPC_URL` set. If any provider token can't move into or out of the vault, stop after the contract step and report the token, the revert and what you think the options are. Don't change the architecture on your own.
3. Match `docs/UI_SPEC.md` closely: tokens, spacing, type sizes, the floating bottom nav, the balance block, the Weekly Top Trades pager, the tabs and chips, the list rows, the detail page chart and tabs, the sticky CTA, and the bottom sheets. Use our own StacksClub mark and Lucide icons. Don't copy any other app's logos or brand assets.
4. Use real data paths everywhere. No hardcoded fake prices, holders or balances in production code. If a table is empty, show the empty state. You may add a `pnpm seed:demo` script that inserts clearly labelled demo profiles and comments into Supabase for local testing only.
5. Never run `forge script --broadcast`, never read or print `DEPLOYER_PRIVATE_KEY`, never commit `.env*` files except `.env.example`.
6. When done, run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `forge test`, fix what fails, then run `pnpm build`.

Finish with a short report:

- what was built, per build step
- the exact commands I need to run myself (Supabase migration, seed assets, deploy contract, export ABI, set Vercel env vars, Vercel cron)
- anything in the Binance docs that differed from our docs
- known gaps or TODOs, in order of importance

## Acceptance checklist

The build is done when all of these work against BSC mainnet on the Vercel preview:

- [ ] Log in with email, get an embedded wallet, finish onboarding
- [ ] Home shows balance, Weekly Top Trades pager, Stocks tab with bStocks and Ondo rows and live prices
- [ ] Stock detail shows chart with timeframes, market cap / reference / premium toggle, holders, feed, about, provider comparison sheet
- [ ] Deposit sheet shows QR and address and detects incoming USDT
- [ ] Buy $5 of one stock, see it in the portfolio
- [ ] Create a 3-stock Stack, see it in the Stacks tab with its index chart
- [ ] Buy $5 of that Stack from a second account, see Position #1 with exact units, creator claimable goes up
- [ ] Sell 50% of the position to USDT
- [ ] Redeem the rest to stock tokens
- [ ] Creator claims fees
- [ ] Follow, comment, like, and see activity in the Social feed
- [ ] Kill the tab mid-buy, reopen, resume from the right step

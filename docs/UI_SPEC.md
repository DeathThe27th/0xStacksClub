# 3AM UI Spec (`/app`)

The app is a mobile-first, dense trading UI. Stocks lead every screen; baskets are one feature among others. The reference is a screen recording of a social memecoin trading app, and this spec describes that layout adapted to tokenized stocks. Do not copy any other app's logo, wordmark, mascot or icon set. The brand is the wordmark (the name from `APP_NAME`, set in the display face) and Lucide icons; there is no logo mark.

Where this file says "Stack", users see "basket". Routes use `/app/basket/[id]`.

Target viewport is 390 to 430px wide. From 1024px up the app uses a desktop layout: a top bar, a market pane on the left, the page in the middle and, on stock and basket pages, an always-open trade panel on the right. Desktop renders at 80% zoom.

## 1. Design tokens

Tokens are CSS variables (RGB channels) in `src/app/globals.css`, mapped in `tailwind.config.ts`. There are four themes, chosen in Settings > Appearance and stored in `localStorage`: **dark** (default, follows the device when set to System), **light**, **Rainbow** and **Binance**. Every colour in the UI comes from a token, so each theme only redefines the variables.

Dark theme values:

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#000000` | Page background |
| `surface` | `#0E0E10` | Cards, chips, sheets |
| `surface-2` | `#1A1A1D` | Pressed states, inputs, sheet option rows |
| `border` | `#26262A` | Hairlines, tab underline track |
| `text` | `#FFFFFF` | Primary text |
| `text-muted` | `#96969E` | Secondary text, inactive tabs |
| `text-dim` | `#5C5C64` | Cents in the big balance, disabled |
| `primary` | `#6C47FF` | Deposit button, CTA, active tab underline |
| `primary-press` | `#5834E6` | Pressed CTA |
| `on-primary` | `#FFFFFF` | Text on `primary` |
| `chip` / `chip-active` | `#0E0E10` / `#1A1A1D` | Filter and preset chips |
| `link` | `#A08CFF` | Text links on the background |
| `up` | `#22C55E` | Positive change, gains |
| `down` | `#FF4430` | Negative change |
| `warn` | `#F5A524` | Market closed / stale price notes |

Light is white with the same violet. Rainbow is a warm cream base with plum ink and pink actions. Binance is the exchange's dark palette: near-black panels, yellow actions with dark text, its green and red. See `globals.css` for their values.

Fonts via `next/font`: Geist for the UI, Bricolage Grotesque 800 for the wordmark and display. `font-feature-settings: "tnum"` on every number so digits don't jitter.

Type scale:

- Balance: 40px / 700. Dollars in `text`, the decimal part in `text-dim` (e.g. `$0` white, `.30` dim).
- Asset detail price: 32px / 700
- Section title: 17px / 600
- Row title (ticker): 17px / 600, uppercase
- Row value (price): 17px / 500
- Secondary lines: 14px / 400 `text-muted`
- Percent change: 13px / 500 with a small filled triangle ▲ or ▼ before it
- Tab labels: 16px / 500, active 600

Radii: cards 16px, chips 12px, CTA buttons 14px, bottom sheet 24px top corners, avatars and token logos fully round.

Spacing: 16px page gutter. Row height 64px with a 48px logo. 8px gap between chips.

## 2. App shell

- Status bar safe area respected (`env(safe-area-inset-top)`).
- Content scrolls under a floating bottom nav.
- Bottom nav: a floating pill, 16px from the sides and 12px above the bottom safe area, height 64px, `surface` at 85% opacity with `backdrop-blur-xl`, 1px `border`, full radius. Five items evenly spaced:
  1. Home (`/app`) house icon
  2. Search (`/app/search`) magnifier
  3. Create basket (`/app/create`), centered, slightly larger
  4. Social (`/app/social`) users icon
  5. Profile (`/app/u/[username]` for self) the user's avatar, 28px round
- Active item sits on a darker rounded capsule (`surface-2`) with a soft inner glow. Inactive icons are `text-muted`.
- Add bottom padding to every page so the last row clears the nav.

## 3. Home (`/app`)

Top to bottom, exactly this order.

### 3.1 Header
- Left: the wordmark.
- No other header items.

### 3.2 Balance block
- Left: total portfolio value (USDT balance + single stock holdings + all positions, valued at current marks) in the balance style.
- Under it: 24h change like `+$0.02 24h`, with the amount in `up` or `down` and "24h" in `text-muted`.
- Right: a `Deposit` button, `primary`, 140 x 56px, radius 14px, 17px / 600 white. It opens the Deposit sheet (section 7).

### 3.2a Texting card
- Directly under the balance: a card for the texting assistant. Not connected: "Trade by text" with a `Connect iMessage` button that opens the connect sheet. Connected: "Text 3AM" with `Open Messages` (an `sms:` link to the user's assigned number) and `Manage`. A small row under it offers Telegram when that is set up.
- On desktop the same card sits under the trade panel on stock and basket pages.
- Hidden when texting isn't configured on the server.

### 3.3 Weekly Top Trades
- Title row: small trophy icon plus "Weekly Top Trades".
- The block is a horizontal pager with two pages the user swipes between. Page 1 "Weekly Top Trades" shows the biggest realised and unrealised gains this week. Page 2 "Hall of Fame" shows the all-time top Stacks by creator earnings. The title text changes as the page changes.
- Cards scroll horizontally with snap, 170px wide, `surface`, radius 16px, and the third card is cut off at the edge to hint scroll.
  - Top row: 24px avatar + username, 15px / 500.
  - Divider.
  - Bottom row: the Stack or stock logo (28px) + the gain in `up`, 17px / 600, like `+$354.12`.
- Tapping a card opens that Stack or stock.

### 3.4 Market tabs
- Three tabs in a row: `☆ Watchlist`, `Stocks`, `Stacks` with a small `New` badge (`primary` background, 11px text, radius 6px).
- Active tab is white with a 2px `primary` underline, inactive is `text-muted`. A full-width 1px `border` line sits under the row.
- Default tab is Stocks.

### 3.5 Filter chips
- Row: a square filter button (sliders icon) then horizontally scrollable chips, `surface`, radius 12px, 40px tall, 15px text.
- Selected chip has white text and a slightly lighter surface. Unselected is `text-muted`.
- Stocks tab chips: `Trending`, `Most held`, `Top gainers`, `bStocks`, `Ondo`.
- Stacks tab chips: `Trending`, `Newest`, `Most held`, `Top performers`.
- Watchlist has no chips.
- The filter button opens a small sheet to sort by price change, market cap or volume.

### 3.6 List rows
Each row, full width, 64px:
- Left: 48px round logo. For a stock use the provider token logo from the catalog. For a Stack use the creator's uploaded image.
- Middle column:
  - Line 1: ticker in row-title style. Right after it, a stack of up to 3 overlapping 20px avatars of people the user follows who hold it, plus a small `2+` pill if there are more.
  - Line 2 for stocks: provider pill (`bStocks` or `Ondo`, 11px, `surface-2`) then `$620.7K MC` or the company name in `text-muted`. Line 2 for Stacks: `by @creator · 3 stocks`.
- Right column, right-aligned:
  - Line 1: current price. Prices under $1 show up to 6 significant digits. Stack rows show the index value (see `FLOWS.md` 6).
  - Line 2: change % with ▲ or ▼ in `up` or `down`.
- Tap opens the detail page. No row dividers. Rows sit directly on `bg`.
- When the same stock exists from both providers, list each as its own row. Under Trending, group them next to each other.
- Price and % flash briefly (150ms background tint in `up` or `down` at 15% opacity) when they update.

### 3.7 Live notifications
- A toast drops from the top in a rounded `surface` card with the app mark, a bold title like `NVDA at $185.20` and a line like `@ada bought $2,450 of AI Kings`, plus `now` on the right. It auto-hides after 4 seconds.
- Source: Supabase Realtime on the `activity` table, only for people the user follows and for trades over $500.

## 4. Stock detail (`/app/stock/[provider]/[address]`)

### 4.1 Top bar
- Back chevron, 40px round logo, then two lines: ticker 18px / 700 with a small BNB chain badge, and the full name in `text-muted` with a copy icon that copies the contract address.
- Right: history icon (opens the user's trades in this asset), star (toggle watchlist, filled when on), share (native share sheet with the page URL).

### 4.2 Price header
- Left: current price in the detail-price style. Under it: absolute and % change with ▼ or ▲ in `up` or `down`, then the timeframe label in `text-muted` (`1h`, `24h`, `All`).
- Right, right-aligned: a small ⇕ toggle icon and market cap value, with the label `Market cap` under it. Tapping the ⇕ switches this block between `Market cap`, `Reference price` (underlying stock price) and `Premium` (onchain vs reference as a %). Show `Reference price` with a `Market closed` note in `warn` when the US market is closed.

### 4.3 Chart
- Full-bleed area chart, 320px tall, no gridlines, no left axis. Price labels on the right edge in `text-muted` 11px.
- Line 2px. Color is `up` if the period change is positive, `down` if negative. Fill is a vertical gradient of the same color from 25% opacity to 0.
- A dashed horizontal line at the current price with a filled pill label on the right edge showing the current price in white on the line color.
- On press-and-drag, show a crosshair, the price header updates to the scrubbed point, and x-axis time labels appear under the chart. Release restores live values. Add light haptic feedback on scrub start where supported (`navigator.vibrate(5)`).
- Controls row under the chart, right-aligned: `LIVE •` (pulsing dot), `1H`, `1D`, `1W`, `ALL`, then a candlestick toggle icon that switches between area and candles. Selected timeframe sits on a `surface-2` capsule.
- Data from `/api/market/candles`. LIVE mode polls every 5 seconds and appends.

### 4.4 Tabs
`Holders (n)`, `Feed`, `About`, same tab style as 3.4.

- Holders
  - A `Friends` toggle (iOS style switch) that filters to people the user follows.
  - Each holder row: 40px avatar, username 17px / 600, `Avg. entry: $182.40` in `text-muted`, and on the right the position value and PnL % in `up` or `down`.
  - If that holder has a recent comment on this asset, show it under the row as an indented reply with a thin connector line from the avatar, plus heart count and reply count in `text-dim`.
  - Holder data comes from our own trades table (users of the app), not from all chain holders.
- Feed: comments on this asset, newest first, with a composer at the top (text only, 280 chars, like/reply).
- About: provider, contract address, decimals, share multiplier if known, provider description, link to BscScan, and a line explaining that this is a provider-issued token, not a direct share.

### 4.5 Footer
- A provider note centered above the CTA in the style of the reference's "Unverified token" line: a small shield icon + `Issued by bStocks` + info icon. Tapping info opens a sheet with the provider comparison for this ticker: each provider's token, price, 24h volume and premium, with the cheaper one marked. Each row links to that provider's detail page.
- Sticky full-width CTA, 56px, `primary`, radius 14px, 16px from the sides, above the bottom safe area. The bottom nav hides on detail pages.
  - If USDT balance is under the minimum buy: `Deposit to buy` opens the Deposit sheet.
  - Else if the user holds none: `Buy`.
  - Else two buttons side by side: `Sell` (`surface-2`) and `Buy` (`primary`).

## 5. Basket detail (`/app/basket/[id]`)

Same structure as the stock detail, with these differences.

- A basket's picture is the logos of its stocks, sliding up one after another every few seconds. If the creator uploaded a picture, that is shown instead.
- Stats include "Traded on 3AM": the total USD traded in this basket by app users. Stock pages show the same stat for the stock.

- Top bar: Stack image, `$AIK` ticker, Stack name, creator line `by @ada` which links to the profile. Right icons the same.
- Price header: index value and change. The right block toggles between `Holders`, `Creator earned` and `Since launch %`.
- Chart: the Stack index series. A second faint dashed line shows the reference-price index when available.
- Tabs: `Holders (n)`, `Composition`, `Feed`, `About`.
  - Composition: one row per component with logo, ticker, provider pill, recipe weight as a thin horizontal bar with the %, and the current value-weight next to it in `text-muted` (these drift apart since there is no rebalancing). Each row links to the stock detail.
  - About: description, creator, created date, recipe hash, contract link and a plain note: "Buying creates your own position with the exact tokens bought. Weights are not rebalanced."
- Footer note: `Created by @ada · 0.25% creator fee`.
- CTA: `Deposit to buy`, `Buy`, or `Sell` + `Buy` as in 4.5. If the user has positions, `Sell` opens a sheet that lists positions and offers both `Sell` and `Redeem stocks`.

## 6. Trade sheets

All trade actions happen in bottom sheets, never full pages.

### 6.1 Sheet style
- Slides up with a spring (framer-motion, stiffness 400, damping 40). Backdrop `black/60`.
- `surface` background, 24px top radius, a 36 x 4px grabber, title centered 20px / 600.
- Drag down to dismiss.

### 6.2 Buy sheet (stock or Stack)
- Big amount input centered, 48px / 700, `$` prefix, numeric keypad. Quick chips under it: `$10`, `$25`, `$50`, `Max`.
- Under the amount: `Balance: 42.10 USDT`.
- Breakdown card (`surface-2`, radius 16px): Fee (1%), Amount invested, and for a Stack a list of each component with the $ allocated and estimated units, then Estimated gas in BNB.
- Validation messages inline in `down` (below minimum, not enough USDT, not enough BNB for gas).
- CTA `Review` goes to a review step with fresh quotes, the quote age countdown, minimum received per leg, then `Confirm buy`.
- After confirm, the sheet becomes the progress checklist (see `FLOWS.md` 3).

### 6.3 Sell sheet
- Percentage selector: slider plus chips `25%`, `50%`, `75%`, `100%`.
- Shows estimated USDT received, 1% fee, and per-leg breakdown for Stacks.
- For a Stack position, a segmented control at the top: `Sell for USDT` / `Redeem stocks`.

### 6.4 Progress checklist
- A vertical list of steps, each with a status icon (empty circle, spinner, green check, red x) and a label, e.g. `Pay fee`, `Buy NVDA (bStocks)`, `Buy MSFT (Ondo)`, `Approve tokens`, `Create position`.
- Failed step shows the reason and two buttons: `Retry` and `Stop and keep tokens`.
- Success state: big check, "Position #123 created", and `View position`.

## 7. Deposit sheet

Title `Deposit with`. Option rows are `surface-2` cards, radius 16px, 72px tall, title 17px / 600 with a subtitle in `text-muted`, icon on the right.

1. `Crypto`, subtitle `Receive USDT on BNB Chain`, QR icon. Opens a sub-view with a QR code of the user's wallet address, the address with a copy button, a network warning ("Only send USDT on BNB Smart Chain (BEP-20)"), and a note that they also need a little BNB for gas. Poll the USDT balance every 5 seconds and show a toast when it increases.
2. `Binance`, subtitle `Withdraw from your Binance account`, Binance-style yellow diamond icon (use a generic icon, not Binance's trademark). Opens the same address view with step-by-step instructions to withdraw USDT and BNB via BNB Smart Chain.
3. `Apple Pay` with `Soon` badge, disabled.
4. `Debit card` with `Soon` badge, disabled.

## 8. Other screens

### 8.1 Search (`/app/search`)
- Autofocus search input at the top (`surface`, radius 12px, 48px). Results in two sections: Stocks and Stacks, then People. Same row style as home. Recent searches when empty.

### 8.2 Create basket (`/app/create`)
A 3-step flow with a progress bar at the top.
1. Pick stocks: search the allowlist, add 2 to 5. Each added item shows a provider switcher if more than one provider has that ticker, defaulting to bStocks.
2. Weights: one horizontal bar is the whole split, one coloured segment per stock. Dragging a boundary moves weight between the two neighbours. Under it, preset chips (`Equal`, `By market cap`) and one row per stock with its logo, what a $100 buy puts into it after the fee, a minus / number / plus control, and (with 3 or more stocks) a lock that holds its weight. Setting one stock's number takes the difference from the unlocked others in proportion. The total is always exactly 100.00% and no stock goes under 1%, so there is no invalid state. The maths is in `src/lib/weights.ts`.
3. Details: an optional picture (square crop, up to 2MB; without one the basket shows its stocks' logos), name (3 to 32 chars), ticker (2 to 6 uppercase letters, checked for uniqueness), description (up to 280 chars), an optional Telegram club link. A summary card, estimated gas, and a launch CTA. Show clearly that the recipe cannot be changed after launch.

### 8.3 Social (`/app/social`)
Social is about the people on the app and what they trade.
- Tabs `Trades`, `People`, `Following`. `Trades` is the default.
- Trades: a horizontal strip of the stocks most traded on the app this week (volume, trader count), then everyone's latest trades, newest first, with avatar, text like `@ada bought $120 of NVDA`, time and the asset row inline.
- People: the week's most active traders by volume, then everyone else on the app with their latest trade, each with a Follow button.
- Following: the same feed, only from people the user follows.

### 8.4 Profile (`/app/u/[username]`)
- Header: 72px avatar, display name, `@username`, bio, X link icon if set, `Followers` and `Following` counts, `Follow` or `Edit profile` button.
- Stats row: total value (own profile only), Stacks created, creator earnings.
- Tabs: `Holdings`, `Stacks`, `Activity`.
  - Holdings: single stocks and positions (own profile shows everything; other profiles show holdings without dollar amounts unless the user opts in via a profile setting `show_values`).
  - Stacks: Stacks this user created.
  - Own profile shows a `Claim $X.XX` card when the creator balance is above zero.
- Settings gear on own profile: appearance (Light, Dark, Rainbow, Binance, System), edit profile, show values toggle, iMessage, Telegram (when set up), export wallet (Privy), log out.
- iMessage sheet: enter a phone number, get a 6-digit code valid for 10 minutes, tap `Text us to connect`. Once connected it shows the masked number, the `Trade by text` switch with the per-buy and per-day limits, and `Disconnect iMessage`.

### 8.5 Position detail (`/app/position/[id]`)
- Header with the Stack logo and `Position #123`, bought date, current value, PnL vs cost basis.
- Component table: ticker, provider, exact units, current value, % of position.
- CTA row: `Sell` and `Redeem stocks`.

### 8.6 Onboarding
- `/` is the landing page (`src/components/landing/`), one scroll-driven page in the app's own tokens, headings in Geist semibold (the wordmark keeps its own face), always in the light theme whatever the visitor chose (`THEME_LOCKS` in `theme-script.ts` sets it before first paint; `useThemeLock` holds it and restores the visitor's theme on the way into `/app`). It is framed around the hours Wall Street is shut ("Trade while Wall Street sleeps"), never around the minimum buy:
  1. Hero: the page's own header (wordmark, section links, `Get started`), then, centred, "Trade while Wall Street sleeps.", one line of copy, `Get started` and "See it by text". Under it a stage across the full width: on the left Wall Street's clock as a ring of 60 ticks (`Countdown.tsx`), the lit arc draining as the current closure (`primary`) or session (`up`) runs out, with `NYSE opens in 6:28:14` ticking in the middle and when that is in the visitor's own time; in the middle a phone on its lock screen at 3:04 on a black wallpaper with the Binance mark, where the texting assistant's messages arrive one by one on load (the live NVDA price, "Reply YES", then "Done. Bought $20 of NVDA."; older ones fold into a stack) while a blue "yes" goes out off the phone's right edge; on the right (desktop) "Moving now", the five biggest 24h moves in the real list. A tape of the real stock list (logo, ticker, price, 24h move) runs under the hero and pauses on hover.
  2. Verbs: `Buy`, `Sell`, `Text`, `Follow` stack up one by one, each with a coloured icon tile and a short line.
  3. Text panel: a full-bleed `primary` field, "Or just text it.", where a phone grows in and a texting-assistant chat (price, buy, YES, done) plays out as you scroll, with the Trade by text limits beside it.
  4. Stocks: "The big names, after hours." with the real stock list scrolling inside a phone.
  5. Hours: "Markets close. Onchain doesn't." beside a dial of the week's 336 half hours (Monday 00:00 New York time at the top). Wall Street's regular session lights in `warn` and the count reads 32½; a `link` sweep then runs round the rest and the count climbs to 168. A note says a few stocks pause while their home market is closed and the app says so before any money moves. NYSE hours and holidays live in `clock.ts` and are display only.
  6. Baskets and Social, with a basket card that turns as you scroll.
  7. Close: a live line, "Wall Street opens in 31m. You don't have to wait." (or "shuts in … You don't have to stop." while it's open), and `Get started`.
  8. Footer: wordmark and one line, the section links, a `Get started` with what signing up takes, the provider and region notice, the year, and the wordmark in `primary` across the full width, running off the bottom edge.
  A floating pill nav at the bottom carries the wordmark, section links (desktop) and `Get started`; it shows only between the hero and the footer. `Get started` which opens Privy login (email, Google, X, and external wallet). Prices are never invented: without data the cards show tickers and names. Scroll progress is measured with `getBoundingClientRect` (`scroll.ts`), because framer-motion's `useScroll` misreads it under the desktop's 80% zoom. With reduced motion every section renders finished at natural height. Signed-in visitors go straight to `/app`.
- After first login, a single onboarding screen: avatar upload, username (3 to 20, lowercase letters, numbers, underscore), bio, optional X URL. Then land on `/app`.

## 9. States, motion and polish

- Skeletons: rows show a grey circle and two bars with a shimmer. The balance shows a bar.
- Empty watchlist: star icon, "Tap the star on any stock to watch it".
- Numbers animate between values with a quick 200ms count.
- Tap targets are at least 44px. Pressed state scales to 0.97.
- Pull to refresh on Home, Social and Profile.
- Respect `prefers-reduced-motion`.
- All text contrast passes WCAG AA against `bg`.

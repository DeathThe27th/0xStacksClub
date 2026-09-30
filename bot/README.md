# Texting assistant (iMessage and Telegram)

A long-lived Node process that answers texts over iMessage, and Telegram if a bot token is set,
using Photon's Spectrum SDK (`spectrum-ts`). It is its own package and deploys separately from the
Next.js app.

The bot holds no Binance, Supabase or wallet secrets and never signs or sends a transaction. Every
message becomes a call to the site's `/api/bot/*` routes (shared-secret header), which do the work
with the same server code the site uses and hand back data and ready-made links. The app's name
comes from `/api/bot/config` (`APP_NAME` in `src/lib/constants.ts`), and the site's address comes
from `SITE_URL`; neither is hardcoded here.

## What it does

Stocks come first. With `GEMINI_API_KEY` set, the bot holds a normal conversation. Gemini reads each
message, calls the bot's tools for anything factual, and writes the reply in its own words:

| Tool | What it does |
| --- | --- |
| `list_stocks` | Tradable stocks with price and 24h change: most traded, gainers or losers |
| `get_price` | One stock by ticker or company name (or a basket, if the name is a basket) |
| `get_news` | News on one stock with its price, or a briefing on the user's stocks and the market |
| `get_portfolio` | The user's total, USDT, stocks held with PnL, basket positions |
| `make_buy_link` | A link that opens the stock's buy form with the amount filled in |
| `list_baskets` | Top baskets, only when the user asks about baskets |
| `get_club_link` | A basket's Telegram club link, for holders only |
| `send_contact_card` | A contact card for this number under the app's name (iMessage) |

It can also answer questions about how the app works (fees, minimums) from facts served by
`/api/bot/config`, and everyday questions briefly from general knowledge.

What the model can't do: a reply is only sent if every link, dollar amount and percentage in it
appears in a tool result, the product facts or the user's own message, and if it contains any link a
tool said it must (the buy confirm link, the club warning). Otherwise the bot sends the reply its
own code builds for the same data. The model never sees wallet addresses or keys, and no tool can
buy, sell or sign.

These exact commands skip the model and answer instantly: `help`, `stocks`, `movers`, `losers`,
`price <name>`, `buy <amount> <name>`, `news [name]`, `portfolio`, `baskets`, `club <basket>`, `sell`. `link <code>`
(iMessage), `/start <code>` (Telegram) and `stop` are always handled by code. If Gemini is slow,
overloaded or rate limited, the bot tries `GEMINI_FALLBACK_MODEL`, then falls back to keyword
matching. Without a key it only uses the commands.

### Buying by text

`buy 20 NVDA` (or "put 20 bucks into nvidia") calls the site's `/api/bot/trade/prepare`. If the
user has turned on Buy by text in the app, the bot asks "Buy $20 of NVDA? Fee $0.20. Reply YES to
buy, or NO to cancel." and remembers the order for 5 minutes. Only a plain yes from the user makes
the bot call `/api/bot/trade/confirm`; that match is done in code and the model can't trigger it.
The bot then reports what the site says happened. If Buy by text is off, the same request returns a
link that opens the buy form instead. The bot itself still holds no wallet keys: the site signs.

The free Gemini tier often takes 5 to 15 seconds per call, and a reply that needs data takes two
calls, so conversational replies can take 10 to 30 seconds. A paid key is much faster.

## How a phone gets connected (shared pool)

On Photon's Free and Pro plans there is no single bot number. Each phone is registered as a "user"
of the Photon project and is given its own number from a shared pool, and a shared line only talks
to registered phones. So:

1. In the app: Settings on your profile, **Connect iMessage**, enter your phone number.
2. The site registers the phone with Photon (`POST /projects/{id}/users`), gets the assigned
   number back, and shows a 6-digit code with a **Text us to connect** button (an `sms:` link to
   that assigned number with `link <code>` filled in).
3. The user sends it. The bot passes the phone and code to the site, which links them only if the
   code was made for that same phone. Codes last 10 minutes.

The site needs `SPECTRUM_PROJECT_ID` and `SPECTRUM_PROJECT_SECRET` for step 2, so those two are
set in Vercel as well as here.

## Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`). It gives you a token and the
   bot gets a username.
2. Put the token in `SPECTRUM_TELEGRAM_BOT_TOKEN` in this folder's `.env` and restart the bot. In
   cloud mode Spectrum registers the bot's webhook through Photon on startup, so no port is opened.
   If nothing arrives, check that Telegram is enabled for the project in the Photon dashboard
   (Platforms).
3. Put the bot's username (without `@`) in `NEXT_PUBLIC_TELEGRAM_BOT` in Vercel and redeploy.
4. In the app, **Connect Telegram** opens `t.me/<bot>?start=<code>`. Pressing Start connects that
   Telegram account. The code is random, single use and lasts 10 minutes.

Only private chats are answered. Telegram messages don't count against the iMessage daily limit.

## Setup

Requirements: Node 22+, pnpm.

```bash
cd bot
pnpm install
cp .env.example .env     # then fill it in
```

| Variable | Notes |
| --- | --- |
| `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET` | Photon dashboard, Settings. Not needed for the terminal provider. |
| `SITE_URL` | The site, no trailing slash |
| `BOT_API_SECRET` | `openssl rand -hex 32`. Must equal `BOT_API_SECRET` in Vercel. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Optional. Default model `gemini-3.5-flash-lite`. |
| `GEMINI_FALLBACK_MODEL` | Optional. Default `gemini-3.1-flash-lite`. |
| `SPECTRUM_TELEGRAM_BOT_TOKEN` | Optional. BotFather token; turns Telegram on alongside iMessage. |
| `BOT_PROVIDER` | `imessage` (default) or `terminal` |
| `TERMINAL_PHONE` | Terminal provider only: the phone the terminal stands in for (E.164) |
| `DAILY_SEND_LIMIT` | Default 4500. Photon's hard limit is 5,000 messages per server per day. |

`.env` is gitignored. Don't commit it and don't paste it into logs.

## Test in a terminal (no iMessage)

The terminal provider runs the whole bot against the live site's `/api/bot` routes.

1. Connect a phone on the site first (Settings, Connect iMessage) and stop at the code screen.
2. Put that phone in `TERMINAL_PHONE` in `.env`, in E.164 (`+14155550132`).
3. Run it and type `link <code>`, then any command:

```bash
pnpm terminal
```

The terminal chat is treated as coming from `TERMINAL_PHONE`. Texts from the terminal don't count
against the daily send limit. For scripted runs, pipe lines in: `printf 'help\n' | pnpm terminal`.

```bash
pnpm test        # parser, reply formatting, handler and quota tests
pnpm typecheck
```

## Run on the VPS with pm2

First time:

```bash
git clone <repo-url> app && cd app/bot
pnpm install --frozen-lockfile
cp .env.example .env && nano .env      # fill in, keep BOT_PROVIDER=imessage
chmod 600 .env
pnpm build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup                            # run the command it prints, once, so it starts on boot
```

Check it:

```bash
pm2 logs imessage-bot --lines 50       # expect "bot started provider=imessage"
pm2 status
```

Run one instance only. Two would both receive and answer every message. If the hello-world bot is
still running against the same Photon project, stop it first (`pm2 delete <name>`).

## Update

```bash
cd app && git pull
cd bot && pnpm install --frozen-lockfile && pnpm build
pm2 restart imessage-bot
```

## Limits and behaviour

- **Inbound-first.** The bot only ever replies. The first reply to a new number is plain text with
  no link, and the contact card follows the welcome. On the shared pool the line's own card says
  "Spectrum", so the bot sends a card it builds: the app's name with the number that user texts.
- **Quotas.** Outbound messages are counted per UTC day in `.state/quota.json` and the bot stops
  replying at `DAILY_SEND_LIMIT`. Replies to one phone are sent in order with a short gap.
- **Throttles.** 12 inbound messages per phone per minute; an unlinked number gets at most 3
  replies an hour.
- **Logs.** Phones are masked (`+234******4321`) and message text is never logged.
- **Email handles.** If an iPhone starts chats from its Apple Account email, the bot asks the user
  to switch to their number (Settings, Messages, Send & Receive).
- **Groups** are ignored.

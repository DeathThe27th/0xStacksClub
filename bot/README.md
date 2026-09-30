# iMessage bot

A long-lived Node process that answers texts over iMessage using Photon's Spectrum SDK
(`spectrum-ts`). It is its own package and deploys separately from the Next.js app.

The bot holds no Binance, Supabase or wallet secrets and never signs or sends a transaction. Every
message becomes a call to the site's `/api/bot/*` routes (shared-secret header), which do the work
with the same server code the site uses and hand back data and ready-made links. The app's name
comes from `/api/bot/config` (`APP_NAME` in `src/lib/constants.ts`), and the site's address comes
from `SITE_URL`; neither is hardcoded here.

## What it understands

| Text | Reply |
| --- | --- |
| `link 123456` | Connects this phone to the account that made the code. Welcome text (no link), then the contact card. |
| `help` | The list of commands |
| `baskets` | Top baskets with their index and 24h change |
| `price <basket>` | One basket's index, change and each stock in it |
| `portfolio` | Positions, total value and PnL |
| `buy <amount> <basket>` | A link that opens the basket's buy form on the site with the amount filled in |
| `club <basket>` | The basket's Telegram link, for holders only |
| `stop` | Disconnects this phone |

Basket names are matched loosely; if several fit, the bot lists them and takes a number back.
Anything that isn't one of these goes to Gemini, which only labels the message as JSON
(`intent`, `basket`, `amount`, `confidence`). The bot's own code checks that label and writes every
reply that contains a link or money. If Gemini is slow (8 seconds), errors or is rate limited, the
bot falls back to a keyword parser; if `GEMINI_API_KEY` is empty it only uses the keyword parser.

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
  no link, and the contact card follows the welcome.
- **Quotas.** Outbound messages are counted per UTC day in `.state/quota.json` and the bot stops
  replying at `DAILY_SEND_LIMIT`. Replies to one phone are sent in order with a short gap.
- **Throttles.** 12 inbound messages per phone per minute; an unlinked number gets at most 3
  replies an hour.
- **Logs.** Phones are masked (`+234******4321`) and message text is never logged.
- **Email handles.** If an iPhone starts chats from its Apple Account email, the bot asks the user
  to switch to their number (Settings, Messages, Send & Receive).
- **Groups** are ignored.

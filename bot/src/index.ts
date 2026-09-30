import { fileURLToPath } from "node:url";
import { Spectrum, contact, type Message, type Space } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { telegram } from "spectrum-ts/providers/telegram";
import { terminal } from "spectrum-ts/providers/terminal";
import { createApi, type BotConfig } from "./api.js";
import { loadConfig } from "./config.js";
import { needPhone, textOnly } from "./format.js";
import { createHandler, type Out } from "./handler.js";
import { log, setLogLevel } from "./log.js";
import { isPhone, maskPhone } from "./mask.js";
import { createAssistant } from "./assistant.js";
import { createQuota } from "./quota.js";

const cfg = loadConfig();
setLogLevel(cfg.LOG_LEVEL);
const isTerminal = cfg.BOT_PROVIDER === "terminal";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Phones are masked in logs; Telegram ids are shortened the same way. */
const maskSender = (s: string) => (s.startsWith("tg:") ? `tg:***${s.slice(-3)}` : maskPhone(s));

const api = createApi({ siteUrl: cfg.SITE_URL, secret: cfg.BOT_API_SECRET });

// The app's name and limits come from the site (APP_NAME in its constants), so a rename there
// reaches the bot without a redeploy. Refreshed every 10 minutes.
async function fetchConfig(): Promise<BotConfig> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await api.config();
    } catch (e) {
      const wait = Math.min(60_000, 2000 * attempt);
      log("error", "can't load /api/bot/config, retrying", { status: (e as { status?: number }).status, code: (e as { code?: string }).code, inMs: wait });
      await sleep(wait);
    }
  }
}
let botConfig = await fetchConfig();
setInterval(() => void api.config().then((c) => (botConfig = c)).catch(() => undefined), 10 * 60_000).unref();

const quota = createQuota(cfg.DAILY_SEND_LIMIT, fileURLToPath(new URL("../.state/quota.json", import.meta.url)));
const handle = createHandler({
  api,
  config: () => botConfig,
  assistant: cfg.GEMINI_API_KEY ? createAssistant({ apiKey: cfg.GEMINI_API_KEY, model: cfg.GEMINI_MODEL, fallbackModel: cfg.GEMINI_FALLBACK_MODEL }) : undefined,
});

// Telegram rides along with iMessage when a bot token is set. Photon relays its webhook, so the
// bot still needs no open port.
const withTelegram = !isTerminal && !!cfg.SPECTRUM_TELEGRAM_BOT_TOKEN;
const cloud = { projectId: cfg.SPECTRUM_PROJECT_ID!, projectSecret: cfg.SPECTRUM_PROJECT_SECRET!, options: { logLevel: cfg.LOG_LEVEL } };
const app = isTerminal
  ? await Spectrum({ providers: [terminal.config()], options: { logLevel: cfg.LOG_LEVEL } })
  : withTelegram
    ? await Spectrum({ ...cloud, providers: [imessage.config(), telegram.config({ botToken: cfg.SPECTRUM_TELEGRAM_BOT_TOKEN! })] })
    : await Spectrum({ ...cloud, providers: [imessage.config()] });

/**
 * Who sent this: a phone in E.164 (iMessage, terminal) or `tg:<id>` (Telegram). Or a reason we
 * can't serve them, or null to ignore the message.
 */
function senderOf(space: Space, message: Message): { phone: string } | { reject: string } | null {
  if (isTerminal) return { phone: cfg.TERMINAL_PHONE! };
  if (message.platform === "telegram") {
    const id = message.sender?.id;
    // A private chat's id is the user's id. Groups and channels are out of scope.
    return id && /^\d+$/.test(id) && space.id === id ? { phone: `tg:${id}` } : null;
  }
  if (message.platform !== "imessage") return null;
  if (imessage(space).type !== "dm") return null; // group chats are out of scope
  const sender = imessage(message).sender;
  const handle = sender?.address ?? sender?.id;
  if (!handle) return null;
  // Apple sometimes starts a chat from the Apple Account email instead of the number.
  return isPhone(handle) ? { phone: handle } : { reject: needPhone() };
}

const isIMessage = (space: Space) => space.__platform === "imessage";

async function send(space: Space, text: string): Promise<boolean> {
  // Only iMessage goes through Photon's lines, so only it counts against the daily limit.
  if (isIMessage(space) && !quota.take()) {
    log("error", "daily send limit reached, not replying", { sent: quota.sent() });
    return false;
  }
  await space.send(text);
  return true;
}

async function deliver(space: Space, outs: Out[]) {
  for (const [i, out] of outs.entries()) {
    if ("run" in out) {
      await out.run().catch((e: unknown) => log("warn", "follow-up failed", { name: e instanceof Error ? e.name : "error" }));
      continue;
    }
    // A short, human gap between messages: bursts are what get a line flagged.
    if (i > 0) await sleep(1200);
    if ("text" in out) {
      if (!(await send(space, out.text))) return;
    } else if (isTerminal) {
      await space.send(`[contact card: ${botConfig.appName}]`);
    } else if (isIMessage(space) && quota.take()) {
      // On the shared pool the line's own card says "Spectrum". A card we build carries the app's
      // name with the number this user texts, so saving it names the thread properly.
      const number = out.contactCard.number;
      if (number) await space.send(contact({ name: { formatted: botConfig.appName, first: botConfig.appName }, org: { name: botConfig.appName }, phones: [{ value: number, type: "mobile" }] }));
      else await imessage(space).shareContactCard();
    }
  }
}

// One message at a time per phone, so replies stay in order; different phones run side by side.
const queues = new Map<string, Promise<void>>();
const seen = new Set<string>();
const recent = new Map<string, number[]>();
const MAX_PER_MINUTE = 12;

function throttled(phone: string): boolean {
  const t = Date.now();
  const hits = (recent.get(phone) ?? []).filter((x) => x > t - 60_000);
  hits.push(t);
  recent.set(phone, hits);
  return hits.length > MAX_PER_MINUTE;
}

async function onMessage(space: Space, message: Message) {
  if (message.direction === "outbound") return;
  if (seen.has(message.id)) return;
  seen.add(message.id);
  if (seen.size > 2000) seen.delete(seen.values().next().value!);

  const type = message.content.type;
  // Tapbacks, read receipts, typing and edits aren't requests.
  if (!["text", "attachment", "voice", "contact", "richlink", "poll"].includes(type)) return;
  const who = senderOf(space, message);
  if (!who) return;
  const key = "phone" in who ? who.phone : space.id;
  if (throttled(key)) {
    log("warn", "throttled", { from: "phone" in who ? maskSender(who.phone) : "non-phone" });
    return;
  }

  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev
    .then(async () => {
      let outs: Out[];
      if ("reject" in who) outs = [{ text: who.reject }];
      else if (message.content.type !== "text") outs = [{ text: textOnly() }];
      else {
        const text = message.content.text;
        log("info", "inbound", { from: maskSender(who.phone), chars: text.length });
        outs = await space.responding(() => handle(who.phone, text));
      }
      await deliver(space, outs);
    })
    .catch((e: unknown) => log("error", "message failed", { name: e instanceof Error ? e.name : "error", message: e instanceof Error ? e.message : String(e) }))
    .finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    });
  queues.set(key, next);
}

// Spectrum leaves signals to the host process (12.10 and later).
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log("info", "stopping", { signal });
  await Promise.race([Promise.allSettled([...queues.values()]), sleep(5000)]);
  await app.stop();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

log("info", "bot started", { provider: withTelegram ? "imessage+telegram" : cfg.BOT_PROVIDER, app: botConfig.appName, gemini: cfg.GEMINI_API_KEY ? cfg.GEMINI_MODEL : "off", sentToday: quota.sent() });

for await (const [space, message] of app.messages) {
  void onMessage(space, message);
}

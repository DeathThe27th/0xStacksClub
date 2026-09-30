import { ApiError, type Api, type BotConfig, type Option } from "./api.js";
import * as f from "./format.js";
import { log } from "./log.js";
import type { Assistant, Turn } from "./assistant.js";
import { parseAmount, parseCommand, parseLoose, type Command } from "./parse.js";
import { createTools, type PendingBuy } from "./tools.js";

/**
 * What to send back, in order. `contactCard.number` is the pool number this user texts; with it the
 * card is saved under the app's name. `run` is work to do after the messages before it have gone out.
 */
export type Out = { text: string } | { contactCard: { number?: string } } | { run: () => Promise<void> } | { then: () => Promise<Out[]> };

type BasketCommand = Extract<Command, { basket: string }>;
type Pending = { cmd: BasketCommand; options: Option[]; at: number };

const PICK_TTL_MS = 5 * 60_000;
const LINKED_TTL_MS = 60_000;
/** How much of a conversation the assistant sees: the last few messages, while they're recent. */
const HISTORY_TURNS = 8;
const HISTORY_TTL_MS = 30 * 60_000;
/** Replies an unlinked number can get per hour. After that we stay quiet instead of repeating ourselves. */
const UNLINKED_REPLIES_PER_HOUR = 3;

const say = (text: string): Out[] => [{ text }];

type Account = { until: number; username?: string; number?: string };
type Chat = { turns: Turn[]; grounding: string[]; at: number };

export function createHandler(deps: { api: Api; config: () => BotConfig; assistant?: Assistant; now?: () => number }) {
  const { api, assistant } = deps;
  const now = deps.now ?? Date.now;
  const picks = new Map<string, Pending>();
  const accounts = new Map<string, Account>();
  const chats = new Map<string, Chat>();
  const unlinkedReplies = new Map<string, number[]>();
  // A text buy the user has been asked to confirm. Only their own "yes" runs it.
  const pendingBuys = new Map<string, PendingBuy & { at: number }>();
  const BUY_TTL_MS = 5 * 60_000;
  const tools = (sender: string) =>
    createTools(api, sender, deps.config(), { contactCard: !isTelegram(sender), onPendingBuy: (p) => pendingBuys.set(sender, { ...p, at: now() }) });

  /** "yes": say we're on it, then run the buy and report what actually happened. */
  function confirmBuy(sender: string, p: PendingBuy): Out[] {
    pendingBuys.delete(sender);
    return [
      { text: f.buying(p.label, p.amountUsd) },
      {
        then: async () => {
          try {
            return say(f.boughtReply(await api.tradeConfirm(sender, p.orderId)));
          } catch (e) {
            log("error", "buy confirm failed", { status: (e as { status?: number }).status, code: (e as { code?: string }).code });
            // We don't know how far it got, so never claim nothing was spent.
            return say("I lost track of that buy. Check your portfolio in the app before trying again.");
          }
        },
      },
    ];
  }

  async function account(phone: string): Promise<Account | null> {
    const cached = accounts.get(phone);
    if (cached && cached.until > now()) return cached;
    const me = await api.me(phone);
    if (!me.linked) return null;
    const a = { until: now() + LINKED_TTL_MS, username: me.username, number: me.number };
    accounts.set(phone, a);
    return a;
  }

  function unlinkedReply(phone: string, text: string): Out[] {
    const recent = (unlinkedReplies.get(phone) ?? []).filter((t) => t > now() - 3600_000);
    if (recent.length >= UNLINKED_REPLIES_PER_HOUR) return [];
    unlinkedReplies.set(phone, [...recent, now()]);
    return say(text);
  }

  const isTelegram = (sender: string) => sender.startsWith("tg:");

  async function link(phone: string, code: string): Promise<Out[]> {
    if (!code) return unlinkedReply(phone, f.linkUsage());
    try {
      const r = await api.link(phone, code);
      accounts.set(phone, { until: now() + LINKED_TTL_MS, username: r.username, number: r.number });
      unlinkedReplies.delete(phone);
      chats.delete(phone);
      const hello = { text: f.welcome(deps.config().appName, r.username) };
      // Welcome first, with no link in it, then (on iMessage) the contact card so they can save the number.
      return isTelegram(phone) ? [hello] : [hello, { contactCard: { number: r.number } }];
    } catch (e) {
      if (e instanceof ApiError && e.code === "bad_code") return unlinkedReply(phone, isTelegram(phone) ? f.badTelegramLink() : f.badCode());
      if (e instanceof ApiError && e.code === "validation") return unlinkedReply(phone, f.linkUsage());
      throw e;
    }
  }

  async function stop(phone: string): Promise<Out[]> {
    const r = await api.unlink(phone);
    accounts.delete(phone);
    picks.delete(phone);
    chats.delete(phone);
    if (!r.wasLinked) return unlinkedReply(phone, f.notConnected());
    const out: Out[] = [{ text: f.unlinked(deps.config().appName) }];
    // The shared line can only message registered phones, so the slot is freed after the goodbye.
    const id = r.photonUserId;
    if (id) out.push({ run: async () => void (await api.release(phone, id)) });
    return out;
  }

  /** Takes "1", "2" or a name from the list we just offered. */
  function resolvePick(phone: string, text: string): BasketCommand | null {
    const p = picks.get(phone);
    if (!p) return null;
    if (now() - p.at > PICK_TTL_MS) {
      picks.delete(phone);
      return null;
    }
    const t = text.trim().toLowerCase().replace(/^\$/, "");
    const n = /^[1-9]$/.test(t) ? Number(t) : null;
    const chosen = n !== null ? p.options[n - 1] : p.options.find((o) => o.name.toLowerCase() === t || o.ticker.toLowerCase() === t);
    if (!chosen) return null;
    picks.delete(phone);
    return { ...p.cmd, basket: chosen.ticker };
  }

  function ambiguous(phone: string, cmd: BasketCommand, r: { match: "many"; options: Option[] } | { match: "none" }): Out[] {
    if (r.match === "none") return say(f.notFound(cmd.basket));
    picks.set(phone, { cmd, options: r.options, at: now() });
    return say(f.whichOne(r.options));
  }

  async function run(phone: string, cmd: Command, text: string): Promise<Out[]> {
    const { appName } = deps.config();
    switch (cmd.kind) {
      case "help":
        return say(f.helpText(appName));
      case "stocks":
        return say(f.stocksReply(await api.stocks(phone, cmd.sort)));
      case "baskets":
        return say(f.basketsReply(await api.baskets(phone)));
      case "portfolio":
        return say(f.portfolioReply(await api.portfolio(phone)));
      case "question":
        return say(f.performanceReply(await api.portfolio(phone, true)));
      case "sell":
        return say(f.sellReply((await api.portfolio(phone)).url));
      case "news": {
        const r = await api.news(phone, cmd.name || undefined);
        if (r.match === "none") return say(f.notFound(cmd.name));
        if (r.match === "many") return say(f.whichOne(r.options.map((o) => ({ ...o, kind: "stock" as const }))));
        return say(f.newsReply(r));
      }
      case "price": {
        if (!cmd.basket.trim()) return say(f.needName("price"));
        const r = await api.lookup(phone, cmd.basket);
        if (r.match === "stock") return say(f.stockReply(r.stock));
        if (r.match === "basket") return say(f.basketReply(r.basket));
        return ambiguous(phone, cmd, r);
      }
      case "club": {
        if (!cmd.basket.trim()) return say("Which basket's club?");
        const r = await api.club(phone, cmd.basket);
        return r.match === "one" ? say(f.clubReply(r)) : ambiguous(phone, cmd, r);
      }
      case "buy": {
        if (!cmd.basket.trim()) return say(f.needName("buy 20"));
        if (cmd.amount === null) return say(f.needAmount(cmd.basket));
        // Same path as the assistant's tool: a YES question if Buy by text is on, else a link.
        const r = await tools(phone).run("buy", { name: cmd.basket, amount_usd: cmd.amount });
        if (r.data.status === "ambiguous") {
          const found = await api.lookup(phone, cmd.basket);
          if (found.match === "many") return ambiguous(phone, cmd, found);
        }
        return say(r.fallback);
      }
      case "link":
      case "stop":
      case "unknown":
        log("debug", "unhandled", { kind: cmd.kind, chars: text.length });
        return say(f.clarify());
    }
  }

  /** The conversation: Gemini answers with our tools. Null means it couldn't, so keywords take over. */
  async function converse(phone: string, text: string, acct: Account): Promise<Out[] | null> {
    if (!assistant) return null;
    const saved = chats.get(phone);
    const chat: Chat = saved && now() - saved.at < HISTORY_TTL_MS ? saved : { turns: [], grounding: [], at: now() };
    const cfg = deps.config();
    const r = await assistant.reply({
      text,
      history: chat.turns,
      grounding: chat.grounding,
      tools: tools(phone),
      appName: cfg.appName,
      facts: cfg.facts,
      username: acct.username,
    });
    if (!r) return null;
    chats.set(phone, {
      turns: [...chat.turns, { role: "user" as const, text }, { role: "model" as const, text: r.text }].slice(-HISTORY_TURNS),
      // Figures and links from the last few turns stay quotable in follow-ups.
      grounding: [...chat.grounding, r.grounding].filter(Boolean).slice(-4),
      at: now(),
    });
    return r.contactCard ? [{ text: r.text }, { contactCard: { number: acct.number } }] : say(r.text);
  }

  /** Keyword path, used when there's no model or it failed. */
  async function keywords(phone: string, cmd: Command, text: string): Promise<Out[]> {
    const picked = resolvePick(phone, text);
    if (picked) return run(phone, picked, text);
    if (cmd.kind !== "unknown") return run(phone, cmd, text);
    if (parseAmount(text) !== null) return say(f.clarify());
    const loose = parseLoose(text);
    if (loose.kind === "unknown") return say(assistant ? f.thinkingTrouble() : f.clarify());
    return run(phone, loose, text);
  }

  async function route(phone: string, text: string): Promise<Out[]> {
    const cmd = parseCommand(text);
    if (cmd.kind === "link") return link(phone, cmd.code);
    if (cmd.kind === "stop") return stop(phone);
    const acct = await account(phone);
    if (!acct) return unlinkedReply(phone, f.notLinked(deps.config().appName, isTelegram(phone)));

    // A waiting buy is answered by code, never by the model: only a plain yes runs it.
    const waiting = pendingBuys.get(phone);
    if (waiting) {
      if (now() - waiting.at > BUY_TTL_MS) pendingBuys.delete(phone);
      else if (/^\s*(yes|y|yep|yeah|yup|confirm|do it|go)[\s.!]*$/i.test(text)) return confirmBuy(phone, waiting);
      else if (/^\s*(no|n|nope|cancel|stop it|never ?mind)[\s.!]*$/i.test(text)) {
        pendingBuys.delete(phone);
        return remember(phone, text, say(f.cancelled()));
      }
    }
    // The exact commands answer instantly from our own code. Everything else is a conversation.
    const exact = cmd.kind !== "unknown" && !(cmd.kind === "buy" && cmd.amount === null);
    const pick = !exact && picks.has(phone) && /^\s*\$?[\w ]{1,40}\s*$/.test(text) ? resolvePick(phone, text) : null;
    if (pick) return remember(phone, text, await run(phone, pick, text));
    if (!exact) {
      const talked = await converse(phone, text, acct);
      if (talked) return talked;
    }
    return remember(phone, text, await keywords(phone, cmd, text));
  }

  /** Keeps keyword replies in the conversation, so "tell me more about the first one" still works. */
  function remember(phone: string, text: string, outs: Out[]): Out[] {
    const said = outs.filter((o): o is { text: string } => "text" in o).map((o) => o.text).join("\n");
    if (!assistant || !said) return outs;
    const saved = chats.get(phone);
    const chat: Chat = saved && now() - saved.at < HISTORY_TTL_MS ? saved : { turns: [], grounding: [], at: now() };
    chats.set(phone, {
      turns: [...chat.turns, { role: "user" as const, text }, { role: "model" as const, text: said }].slice(-HISTORY_TURNS),
      grounding: [...chat.grounding, said].slice(-4),
      at: now(),
    });
    return outs;
  }

  /** One inbound text in, the replies out. Never throws: every failure becomes a short message. */
  return async function handle(phone: string, text: string): Promise<Out[]> {
    try {
      return await route(phone, text);
    } catch (e) {
      if (e instanceof ApiError) {
        log("warn", "api error", { status: e.status, code: e.code });
        if (e.code === "not_linked") {
          accounts.delete(phone);
          return unlinkedReply(phone, f.notLinked(deps.config().appName, isTelegram(phone)));
        }
        if (e.code === "rate_limited") return say(f.tooFast());
      } else {
        log("error", "handler error", { name: e instanceof Error ? e.name : "error", message: e instanceof Error ? e.message : String(e) });
      }
      return say(f.unreachable(deps.config().appName));
    }
  };
}

import { ApiError, type Api, type BasketRef, type BotConfig, type Portfolio } from "./api.js";
import * as f from "./format.js";
import { log } from "./log.js";
import type { Nlu } from "./nlu.js";
import { parseAmount, parseCommand, parseLoose, type Command } from "./parse.js";

/** What to send back, in order. `run` is work to do after the messages before it have gone out. */
export type Out = { text: string } | { contactCard: true } | { run: () => Promise<void> };

type BasketCommand = Extract<Command, { basket: string }>;
type Pending = { cmd: BasketCommand; options: BasketRef[]; at: number };

const PICK_TTL_MS = 5 * 60_000;
const LINKED_TTL_MS = 60_000;
const MIN_CONFIDENCE = 0.6;
/** Replies an unlinked number can get per hour. After that we stay quiet instead of repeating ourselves. */
const UNLINKED_REPLIES_PER_HOUR = 3;

const say = (text: string): Out[] => [{ text }];

export function createHandler(deps: { api: Api; config: () => BotConfig; nlu?: Nlu; now?: () => number }) {
  const { api, nlu } = deps;
  const now = deps.now ?? Date.now;
  const picks = new Map<string, Pending>();
  const linkedUntil = new Map<string, number>();
  const unlinkedReplies = new Map<string, number[]>();

  async function isLinked(phone: string): Promise<boolean> {
    if ((linkedUntil.get(phone) ?? 0) > now()) return true;
    const me = await api.me(phone);
    if (me.linked) linkedUntil.set(phone, now() + LINKED_TTL_MS);
    return me.linked;
  }

  function unlinkedReply(phone: string, text: string): Out[] {
    const recent = (unlinkedReplies.get(phone) ?? []).filter((t) => t > now() - 3600_000);
    if (recent.length >= UNLINKED_REPLIES_PER_HOUR) return [];
    unlinkedReplies.set(phone, [...recent, now()]);
    return say(text);
  }

  async function link(phone: string, code: string): Promise<Out[]> {
    if (!code) return unlinkedReply(phone, f.linkUsage());
    try {
      const r = await api.link(phone, code);
      linkedUntil.set(phone, now() + LINKED_TTL_MS);
      unlinkedReplies.delete(phone);
      // Welcome first, with no link in it, then the contact card so they can save the number.
      return [{ text: f.welcome(deps.config().appName, r.username) }, { contactCard: true }];
    } catch (e) {
      if (e instanceof ApiError && e.code === "bad_code") return unlinkedReply(phone, f.badCode());
      if (e instanceof ApiError && e.code === "validation") return unlinkedReply(phone, f.linkUsage());
      throw e;
    }
  }

  async function stop(phone: string): Promise<Out[]> {
    const r = await api.unlink(phone);
    linkedUntil.delete(phone);
    picks.delete(phone);
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

  function ambiguous(phone: string, cmd: BasketCommand, r: { match: "many"; options: BasketRef[] } | { match: "none" }): Out[] {
    if (r.match === "none") return say(f.notFound(cmd.basket));
    picks.set(phone, { cmd, options: r.options, at: now() });
    return say(f.whichBasket(r.options));
  }

  async function question(phone: string, text: string): Promise<Out[]> {
    const p = await api.portfolio(phone, true);
    let sentence: string | null = null;
    if (nlu && p.positions.length) {
      const { facts, numbers } = weekFacts(p);
      sentence = await nlu.answer(text, facts, numbers);
    }
    return say(f.weekReply(p, sentence));
  }

  async function run(phone: string, cmd: Command, text: string): Promise<Out[]> {
    const { appName, maxBuyUsd } = deps.config();
    switch (cmd.kind) {
      case "help":
        return say(f.helpText(appName));
      case "baskets":
        return say(f.basketsReply(await api.baskets(phone)));
      case "portfolio":
        return say(f.portfolioReply(await api.portfolio(phone)));
      case "question":
        return question(phone, cmd.text);
      case "price": {
        if (!cmd.basket.trim()) return say(f.needBasket("price"));
        const r = await api.price(phone, cmd.basket);
        return r.match === "one" ? say(f.priceReply(r)) : ambiguous(phone, cmd, r);
      }
      case "club": {
        if (!cmd.basket.trim()) return say(f.needBasket("club"));
        const r = await api.club(phone, cmd.basket);
        return r.match === "one" ? say(f.clubReply(r)) : ambiguous(phone, cmd, r);
      }
      case "buy": {
        if (!cmd.basket.trim()) return say(f.needBasket("buy 25"));
        if (cmd.amount === null) return say(f.needAmount(cmd.basket));
        // Checked here and again on the site; the link only pre-fills a form the user must confirm.
        if (!Number.isFinite(cmd.amount) || cmd.amount <= 0) return say(f.buyReply({ match: "bad_amount" }));
        if (cmd.amount > maxBuyUsd) return say(f.buyReply({ match: "above_max", basket: { name: cmd.basket, ticker: "" }, maxUsd: maxBuyUsd }));
        const r = await api.buy(phone, cmd.basket, cmd.amount);
        return r.match === "many" || r.match === "none" ? ambiguous(phone, cmd, r) : say(f.buyReply(r));
      }
      case "link":
      case "stop":
      case "unknown":
        log("debug", "unhandled", { kind: cmd.kind, chars: text.length });
        return say(f.clarify());
    }
  }

  /** Plain English: Gemini labels it, our code checks the label. Falls back to keywords on any failure. */
  async function understand(text: string): Promise<Command | "clarify"> {
    const parsed = nlu ? await nlu.parse(text) : null;
    if (!parsed) return parseLoose(text);
    if (parsed.intent === "unknown" || parsed.confidence < MIN_CONFIDENCE) {
      const loose = parseLoose(text);
      return loose.kind === "unknown" ? "clarify" : loose;
    }
    const basket = (parsed.basket ?? "").trim();
    switch (parsed.intent) {
      case "help":
      case "baskets":
      case "portfolio":
        return { kind: parsed.intent };
      case "question":
        return { kind: "question", text };
      case "price":
      case "club":
        return { kind: parsed.intent, basket };
      case "buy":
        return { kind: "buy", amount: parsed.amount !== null && parsed.amount > 0 ? Math.round(parsed.amount * 100) / 100 : null, basket };
    }
  }

  async function route(phone: string, text: string): Promise<Out[]> {
    const cmd = parseCommand(text);
    if (cmd.kind === "link") return link(phone, cmd.code);
    if (cmd.kind === "stop") return stop(phone);
    if (!(await isLinked(phone))) return unlinkedReply(phone, f.notLinked(deps.config().appName));

    const picked = resolvePick(phone, text);
    if (picked) return run(phone, picked, text);
    // "25" after "How much?" isn't tracked: the hint tells them to send the whole command.
    // "buy a hundred of ai kings" parses as a buy with no amount: let the model read the amount.
    const needsModel = cmd.kind === "unknown" || (cmd.kind === "buy" && cmd.amount === null && !!nlu);
    if (!needsModel) return run(phone, cmd, text);
    if (parseAmount(text) !== null) return say(f.clarify());

    const understood = await understand(text);
    if (understood === "clarify") return say(f.clarify());
    return run(phone, understood, text);
  }

  /** One inbound text in, the replies out. Never throws: every failure becomes a short message. */
  return async function handle(phone: string, text: string): Promise<Out[]> {
    try {
      return await route(phone, text);
    } catch (e) {
      if (e instanceof ApiError) {
        log("warn", "api error", { status: e.status, code: e.code });
        if (e.code === "not_linked") {
          linkedUntil.delete(phone);
          return unlinkedReply(phone, f.notLinked(deps.config().appName));
        }
        if (e.code === "rate_limited") return say(f.tooFast());
      } else {
        log("error", "handler error", { name: e instanceof Error ? e.name : "error", message: e instanceof Error ? e.message : String(e) });
      }
      return say(f.unreachable(deps.config().appName));
    }
  };
}

/** What the model may see for a performance question: names and percentages only, no money. */
export function weekFacts(p: Portfolio): { facts: unknown; numbers: string[] } {
  const numbers: string[] = [];
  const show = (n: number | null | undefined) => {
    if (n === null || n === undefined) return null;
    const s = f.pct(n);
    numbers.push(s);
    return s;
  };
  const facts = {
    note: "sinceBuying is the user's own gain or loss on the position. basket7d is the basket's index move over 7 days, not the user's gain for the week.",
    positions: p.positions.map((x) => ({ basket: x.name ?? x.ticker ?? `#${x.id}`, basket7d: show(x.basketChange7d), sinceBuying: show(x.pnlPct) })),
  };
  return { facts, numbers };
}

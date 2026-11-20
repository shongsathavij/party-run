// Change the cart before it's approved. Two ways in:
//  - set: a + / − tap on one item. Plain code, no AI, no tokens.
//  - change: the parent's words ("make the cake chocolate"). Claude when it's on, rules when it isn't.
// Either way the new cart is rebuilt from the catalog and checked like a fresh plan. Nothing is
// bought here, and any approved permission no longer matches, so the parent approves again.
import { claudeAgent, rulesEdit, rebuild, diffCarts, flagTheme, readRequest, safetyProblems } from './_lib/agent.js';
import { pickFor } from './_lib/pick.js';
import { checkCart, dollars } from '../lib/rules.js';
import { byId } from '../lib/catalog.js';
import { optionsFor, qtyFor } from '../lib/options.js';
import { post, fail, isoDate, serverToday } from './_lib/http.js';
import { allowClaude } from './_lib/limits.js';

const clean = (t) => String(t || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);

export default post(async ({ prompt, today: day, cart: raw, set, change, add, swap }, req) => {
  const text = String(prompt || '').trim().slice(0, 1200);
  const today = isoDate(day) || serverToday();
  if (!raw || !Array.isArray(raw.items) || !isoDate(raw.partyDate)) throw fail('Missing the cart.');
  // Only ids, quantities and the parent's numbers are taken from the page; prices come from the catalog.
  const lines = raw.items.filter((i) => byId[i?.id]).map((i) => ({ id: i.id, qty: Math.max(1, Math.min(40, Number(i.qty) | 0)), reason: i.reason }));
  const cart = rebuild({ ...raw, budget: Number.isInteger(raw.budget) ? raw.budget : null, kids: Math.max(1, Math.min(60, Number(raw.kids) | 0 || 10)) }, lines);

  let next, mode, note = null, usage = null;
  if (swap) {
    // "Swap": one of the other options the page showed, for the same part of the party. Rules, no tokens.
    const from = cart.items.find((i) => i.id === swap.from);
    const to = byId[swap.to];
    if (!from || !to || to.category !== from.category) throw fail("That swap doesn't fit.");
    const asked = readRequest(text, today);
    const allowed = optionsFor({ category: from.category, date: cart.partyDate, today, theme: asked.theme, little: asked.little, exclude: cart.items.map((i) => i.id) });
    if (!allowed.some((p) => p.id === to.id)) throw fail(`${to.name} can't be had for this party.`);
    next = rebuild(cart, cart.items.map((i) => (i.id === from.id ? { id: to.id, qty: qtyFor(to, { kids: cart.kids, was: from.qty }) } : { id: i.id, qty: i.qty, reason: i.reason })));
    mode = 'tap';
  } else if (add) {
    // "Add a piñata": the same picker as a replacement, within what the budget leaves.
    const asked = readRequest(text, today);
    const room = (cart.budget || Infinity) - cart.total;
    const { pick, why } = pickFor({ category: String(add), date: cart.partyDate, today, room: Number.isFinite(room) ? room : 10 ** 9, theme: asked.theme, little: asked.little });
    if (!pick) return { ok: false, cart: flagTheme(cart, text, today), why, mode: 'tap' };
    next = rebuild(cart, [...cart.items.map((i) => ({ id: i.id, qty: i.qty })), { id: pick.id, qty: 1, reason: asked.little && pick.pull ? 'Pull-string, so no bat swinging near little kids.' : undefined }]);
    mode = 'tap';
  } else if (set) {
    const qty = Number(set.qty) | 0;
    if (!byId[set.id]) throw fail('Unknown item.');
    const out = cart.items.map((i) => ({ id: i.id, qty: i.id === set.id ? qty : i.qty }));
    if (!out.some((l) => l.id === set.id) && qty > 0) out.push({ id: set.id, qty });
    next = rebuild(cart, out.filter((l) => l.qty > 0));
    mode = 'tap';
  } else {
    const words = clean(change);
    if (words.length < 2) throw fail('Say what to change, like "two cakes" or "no piñata".');
    const live = Boolean(process.env.ANTHROPIC_API_KEY);
    if (live && allowClaude(req)) {
      const r = await claudeAgent(text, today, { edit: { cart, change: words } }).catch((e) => ({ mode: 'fallback', why: [e.message] }));
      usage = r.usage || null;
      if (r.mode === 'claude') {
        next = rebuild(cart, r.cart.items.map((i) => ({ id: i.id, qty: i.qty, reason: i.reason })), { notes: r.cart.notes, unmet: r.cart.unmet, budget: r.cart.budget ?? cart.budget });
        mode = 'claude';
      }
    }
    if (!next) {
      const r = rulesEdit(cart, words, today);
      next = r.cart;
      note = r.note;
      mode = live ? 'rules-fallback' : 'rules';
    }
  }

  // The same checks as a fresh plan. A change that would break them is refused, and the cart stays as it was.
  const chk = checkCart(next.items.map((i) => ({ id: i.id, qty: i.qty })), { partyDate: next.partyDate, today, kids: next.kids, budget: next.budget });
  const over = next.budget && next.total > next.budget;
  if (chk.hard.length || over) {
    return { ok: false, cart: flagTheme(cart, text, today), why: over ? `That would bring the cart to ${dollars(next.total)}, over your ${dollars(next.budget)} budget. Raise the budget or take something out.` : chk.hard[0], mode };
  }
  // If the parent picks something not meant for 2-year-olds, it's their call; the cart says so.
  const safety = safetyProblems(next.items, text, today).map((m) => m.replace(/ Use a pull-string.*| Pick favors.*/, ''));
  next.unmet = [...next.unmet.filter((u) => !/ for \d+ kids|over the .* budget|2-year-olds are coming/.test(u)), ...chk.soft, ...safety];
  console.log(`[edit] ${mode}${usage ? ` ${usage.turns} turns, ${usage.input_tokens}+${usage.output_tokens} tokens` : ''}`);
  return { ok: true, cart: flagTheme(next, text, today), diff: diffCarts(cart, next), budgetChanged: next.budget !== cart.budget ? next.budget : undefined, note, mode };
});

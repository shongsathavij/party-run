// The spending rules, shared by the page, the server, the agent's checks, and the evals.
// Pure functions: change a rule here, never in a copy.
import { byId, STORES } from './catalog.js';

export const ASK_OVER_CHOICES = [5000, 15000, 30000, null, 0]; // cents; null = never ask, 0 = always ask
export const DEFAULT_ASK_OVER = 15000;
export const TOKEN_MINUTES = 30; // each store's pass expires this long after it's made

const day = (iso) => new Date(`${iso}T12:00:00Z`);
export const daysBetween = (a, b) => Math.round((day(b) - day(a)) / 86400000);
export const dollars = (c) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

// Group a cart's lines by store. Lines are { id, qty } (anything else is ignored), and
// prices always come from the catalog, never from the lines.
export function totals(lines) {
  const stores = {};
  let total = 0;
  for (const l of lines) {
    const p = byId[l.id];
    if (!p) continue;
    const amount = p.price * l.qty;
    (stores[p.store] ||= { store: p.store, name: STORES[p.store].name, amount: 0, lines: [] });
    stores[p.store].amount += amount;
    stores[p.store].lines.push({ id: p.id, qty: l.qty, amount });
    total += amount;
  }
  return { stores: Object.values(stores), total };
}

// Problems with a cart. hard: it can't be bought as is. soft: it can, but not as asked.
export function checkCart(lines, { partyDate, today, kids, budget }) {
  const hard = [], soft = [];
  const seen = new Set();
  if (!Array.isArray(lines) || !lines.length) hard.push('The cart is empty.');
  for (const l of lines || []) {
    const p = byId[l?.id];
    if (!p) { hard.push(`Unknown product id: ${l?.id}.`); continue; }
    if (seen.has(p.id)) hard.push(`${p.name} is in the cart twice; use one line with a quantity.`);
    seen.add(p.id);
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > 40) hard.push(`${p.name}: quantity must be a whole number from 1 to 40.`);
    if (partyDate && p.booked.includes(partyDate)) hard.push(`${p.name} is booked on ${partyDate}; pick something else.`);
    if (partyDate && today && daysBetween(today, partyDate) < p.lead) hard.push(`${p.name} needs ${p.lead} days' notice and the party is ${daysBetween(today, partyDate)} days away.`);
    if (p.per === 'kid' && kids && l.qty < kids) soft.push(`${p.name}: ${l.qty} for ${kids} kids.`);
  }
  const { total } = totals(lines || []);
  if (budget && total > budget) soft.push(`The cart is ${dollars(total)}, over the ${dollars(budget)} budget.`);
  return { hard, soft, total };
}

// The permission a parent grants: each store gets its own cap (its approved total),
// the caps add up to no more than the budget, and it all ends on the party date.
export function permissionFor(lines, { budget, askOver = DEFAULT_ASK_OVER, partyDate }) {
  const t = totals(lines);
  return {
    budget,
    total: t.total,
    askOver, // purchases above this pause for a tap; null never asks, 0 always asks
    ends: partyDate, // no purchases after the party date
    stores: Object.fromEntries(t.stores.map((s) => [s.store, { cap: s.amount, lines: s.lines.map(({ id, qty }) => ({ id, qty })) }])),
  };
}

// Whether a purchase can go ahead under a permission, before any money moves.
// (The store can still try to charge more at its own checkout; the token's cap catches that.)
export function decide(perm, store, amount, { approved = false, today } = {}) {
  const s = perm.stores[store];
  if (!s) return { ok: false, why: `${STORES[store]?.name || store} isn't in what you approved.` };
  if (today && perm.ends && today > perm.ends) return { ok: false, why: 'This permission ended on the party date.' };
  if (amount > s.cap) return { ok: false, why: `${dollars(amount)} is more than the ${dollars(s.cap)} you approved for ${STORES[store].name}.` };
  const ask = perm.askOver === 0 || (perm.askOver != null && amount > perm.askOver);
  if (ask && !approved) return { ok: false, ask: true, why: `Over your ${perm.askOver === 0 ? 'ask-every-time' : dollars(perm.askOver)} rule, so it needs your OK.` };
  return { ok: true };
}

// Raising one store's cap (a price went up and the parent said yes) can't push the
// permission past the budget.
export function raise(perm, store, newCap) {
  const s = perm.stores[store];
  if (!s) throw new Error("That store isn't in this permission.");
  const others = Object.entries(perm.stores).filter(([k]) => k !== store).reduce((a, [, v]) => a + v.cap, 0);
  if (others + newCap > perm.budget) throw new Error(`That would put the party at ${dollars(others + newCap)}, over your ${dollars(perm.budget)} budget.`);
  return { ...perm, total: others + newCap, stores: { ...perm.stores, [store]: { ...s, cap: newCap } } };
}

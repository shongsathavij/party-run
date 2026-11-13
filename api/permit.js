// The parent approves the cart: the server prices it from the catalog, checks it, and signs
// a permission with one cap per store. Nothing is charged yet.
import { checkCart, permissionFor, ASK_OVER_CHOICES } from '../lib/rules.js';
import { seal } from './_lib/permit.js';
import { post, fail, isoDate, serverToday } from './_lib/http.js';

export default post(async ({ items, budget, askOver, partyDate }) => {
  const lines = (Array.isArray(items) ? items : []).map((i) => ({ id: String(i?.id || ''), qty: Number(i?.qty) }));
  const date = isoDate(partyDate);
  if (!date) throw fail('Missing the party date.');
  const today = serverToday();
  const chk = checkCart(lines, { partyDate: date, today });
  if (chk.hard.length) throw fail(chk.hard[0]);
  if (!ASK_OVER_CHOICES.includes(askOver)) throw fail('Pick when the agent should ask you.');
  // No budget in the request: the cart's total is the budget, so nothing can grow.
  const cap = Number.isInteger(budget) && budget > 0 ? budget : chk.total;
  if (chk.total > cap) throw fail('The cart is over your budget. Take something out first.');
  const perm = permissionFor(lines, { budget: cap, askOver, partyDate: date });
  return { ...seal(perm), perm: JSON.parse(seal(perm).permission) };
});

// When something falls through (the rental cancels, or you skip a store), find another one
// of the same thing from a different store. Rules, not AI: the catalog, the date, and what's
// left of the budget decide. Nothing is bought here; the parent approves a new permission.
import { PRODUCTS, STORES, offTheme } from '../lib/catalog.js';
import { daysBetween, dollars } from '../lib/rules.js';
import { post, fail, isoDate, serverToday } from './_lib/http.js';

const WHAT = { bounce: 'bounce house', cake: 'cake', pinata: 'piñata', decor: 'decorations', favors: 'favors', food: 'food' };

export default post(async ({ category, partyDate, excludeStores = [], maxCents, theme = null }) => {
  const date = isoDate(partyDate);
  if (!date) throw fail('Missing the party date.');
  if (!WHAT[category]) throw fail('Unknown category.');
  const today = serverToday();
  const skip = new Set((Array.isArray(excludeStores) ? excludeStores : []).map(String));
  const room = Number.isInteger(maxCents) && maxCents > 0 ? maxCents : 0;
  const fits = PRODUCTS.filter((p) => p.category === category && !STORES[p.store].test && !skip.has(p.store) && !p.booked.includes(date) && daysBetween(today, date) >= p.lead);
  const affordable = fits.filter((p) => p.price <= room);
  const pick = affordable.find((p) => !offTheme(p, theme)) || affordable.sort((a, b) => a.price - b.price)[0];
  if (!pick) {
    const why = fits.length ? `The cheapest other ${WHAT[category]} is ${dollars(Math.min(...fits.map((p) => p.price)))}, and ${dollars(room)} is left in your budget.` : `No other store has a ${WHAT[category]} free on that date.`;
    return { item: null, why };
  }
  return {
    item: { id: pick.id, qty: 1, name: pick.name, store: pick.store, storeName: STORES[pick.store].name, category, price: pick.price, amount: pick.price, url: pick.url || null, reason: pick.about.split('.')[0] + '.', offTheme: offTheme(pick, theme), needsOk: false, per: pick.per },
  };
});

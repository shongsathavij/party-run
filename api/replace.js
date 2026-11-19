// When something falls through (the rental cancels, or you skip a store), find another one
// of the same thing from a different store. Rules, not AI: the catalog, the date, and what's
// left of the budget decide. Nothing is bought here; the parent approves a new permission.
import { STORES, offTheme } from '../lib/catalog.js';
import { post, fail, isoDate, serverToday } from './_lib/http.js';
import { pickFor, WHAT } from './_lib/pick.js';

export default post(async ({ category, partyDate, excludeStores = [], maxCents, theme = null, little = false }) => {
  const date = isoDate(partyDate);
  if (!date) throw fail('Missing the party date.');
  if (!WHAT[category]) throw fail('Unknown category.');
  const room = Number.isInteger(maxCents) && maxCents > 0 ? maxCents : 0;
  const { pick, why } = pickFor({ category, date, today: serverToday(), room, theme, little: Boolean(little), skipStores: Array.isArray(excludeStores) ? excludeStores : [] });
  if (!pick) return { item: null, why };
  return {
    item: { id: pick.id, qty: 1, name: pick.name, store: pick.store, storeName: STORES[pick.store].name, category, price: pick.price, amount: pick.price, url: pick.url || null, reason: pick.about.split('.')[0] + '.', offTheme: offTheme(pick, theme), needsOk: false, per: pick.per },
  };
});

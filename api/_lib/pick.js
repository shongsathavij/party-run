// Pick one item of a kind for the party: free on the date, enough notice, within the money
// left, never the made-up test store, on theme when possible, and safe for little kids.
import { PRODUCTS, STORES, offTheme } from '../../lib/catalog.js';
import { daysBetween, dollars } from '../../lib/rules.js';

export const WHAT = { bounce: 'bounce house', cake: 'cake', pinata: 'piñata', decor: 'decorations', favors: 'favors', food: 'food' };

export function pickFor({ category, date, today, room, theme = null, little = false, skipStores = [] }) {
  const skip = new Set(skipStores.map(String));
  const fits = PRODUCTS.filter((p) => p.category === category && !STORES[p.store].test && !skip.has(p.store) && !p.booked.includes(date) && daysBetween(today, date) >= p.lead);
  // With kids under 4: pull-string piñatas only, and favors rated ages 2 and up.
  const safe = fits.filter((p) => !little || (category === 'pinata' ? p.pull : category === 'favors' ? (p.ages || '').startsWith('2') : true));
  const affordable = safe.filter((p) => p.price <= room);
  const pick = affordable.find((p) => !offTheme(p, theme)) || affordable.sort((a, b) => a.price - b.price)[0];
  if (pick) return { pick };
  if (fits.length && !safe.length) return { why: `The only other ${WHAT[category]} ${fits.length > 1 ? 'options aren\'t' : 'isn\'t'} safe with 2-year-olds coming${category === 'pinata' ? ' (they need a bat)' : ''}.` };
  if (safe.length) return { why: `The cheapest other ${WHAT[category]} is ${dollars(Math.min(...safe.map((p) => p.price)))}, and ${dollars(room)} is left in your budget.` };
  return { why: `No other store has a ${WHAT[category]} free on that date.` };
}

// What else could fill this part of the party: the same rules as the picker that adds or
// replaces an item. Free on the date, enough notice, never the made-up test store, and safe for
// little kids (pull-string piñatas only, favors rated ages 2 and up). On-theme first, then cheapest.
import { PRODUCTS, STORES, offTheme } from './catalog.js';
import { daysBetween } from './rules.js';

export const fits = (p, { date, today }) => !STORES[p.store].test && !p.booked.includes(date) && daysBetween(today, date) >= p.lead;
export const safeFor = (p, little) => !little || (p.category === 'pinata' ? Boolean(p.pull) : p.category === 'favors' ? (p.ages || '').startsWith('2') : true);

export function optionsFor({ category, date, today, theme = null, little = false, exclude = [] }) {
  const skip = new Set(exclude);
  return PRODUCTS.filter((p) => p.category === category && !skip.has(p.id) && fits(p, { date, today }) && safeFor(p, little))
    .sort((a, b) => Number(offTheme(a, theme)) - Number(offTheme(b, theme)) || a.price - b.price);
}

// How many to buy when one item takes another's place: enough favor packs for every kid.
export const qtyFor = (p, { kids, was = 1 }) => (p.per === 'pack' ? Math.ceil(kids / p.packOf) : was);

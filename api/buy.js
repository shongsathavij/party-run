// The agent buys from one store, within the parent's permission:
//   1. check the permission (signature, store, cap, the ask-me rule),
//   2. mint a shared payment token for this store only, capped at what was approved,
//   3. the store charges it at its own checkout. If the store asks for more than the cap
//      (the "price went up" curveball), the token refuses it and the agent asks the parent.
import { totals, decide, dollars } from '../lib/rules.js';
import { STORES } from '../lib/catalog.js';
import { open } from './_lib/permit.js';
import { mint, charge } from './_lib/stripe.js';
import { post, fail, serverToday } from './_lib/http.js';

const PRICE_UP = 2000; // the curveball: a $20 "weekend delivery fee" added at the store's checkout

export default post(async ({ permission, signature, store, approved = false, curveball = null }) => {
  const perm = open(permission, signature);
  const s = perm.stores[store];
  if (!s) throw fail(`${STORES[store]?.name || 'That store'} isn't in what you approved.`);
  const quoted = totals(s.lines).total; // prices from the catalog, not the page
  const d = decide(perm, store, quoted, { approved: approved === true, today: serverToday() });
  if (!d.ok) return { status: d.ask ? 'ask' : 'refused', why: d.why, amount: quoted };

  // What the store's checkout actually asks for.
  const isRental = /rentals/i.test(STORES[store].kind);
  const asked = curveball === 'price_up' && isRental ? quoted + PRICE_UP : quoted;

  const token = await mint({ store, cap: s.cap, ref: perm.id });
  const r = await charge({ token, amount: asked, store, permId: perm.id, description: `Party Run: ${STORES[store].name}` });
  const pass = { id: token.id, cap: token.cap, expiresAt: token.expiresAt, sample: token.sample };
  if (r.blocked) {
    return {
      status: 'blocked',
      asked,
      cap: s.cap,
      pass,
      why: asked > s.cap ? `${STORES[store].name} asked for ${dollars(asked)} at checkout, ${dollars(asked - s.cap)} more than you approved. The pass refused it.` : r.why,
      railsMissed: Boolean(r.railsMissed),
    };
  }
  return { status: 'paid', amount: r.amount, payment: r.id, pass, sample: Boolean(r.sample) };
});

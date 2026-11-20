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

const PRICE_UP = 2000; // the what-if: a made-up $20 added at the rental's checkout. Simulated; no real store did this.

export default post(async ({ permission, signature, store, approved = false, curveball = null, test = false }) => {
  const perm = open(permission, signature);
  const s = perm.stores[store];
  if (!s) throw fail(`${STORES[store]?.name || 'That store'} isn't in what you approved.`);
  const quoted = totals(s.lines).total; // prices from the catalog, not the page
  // A stress test asks for more than the pass on purpose, so the ask-me step doesn't apply.
  const d = decide(perm, store, quoted, { approved: approved === true || test === true, today: serverToday() });
  if (!d.ok) return { status: d.ask ? 'ask' : 'refused', why: d.why, amount: quoted };

  // What the store's checkout actually asks for.
  const isRental = /rental/i.test(STORES[store].kind);
  const asked = test === true ? s.cap + PRICE_UP : curveball === 'price_up' && isRental ? quoted + PRICE_UP : quoted;

  const token = await mint({ store, cap: s.cap, ref: perm.id, wallet: perm.wallet });
  const r = await charge({ token, amount: asked, store, permId: perm.id, description: `Party Run test, simulated order: ${STORES[store].name}` });
  const pass = { id: token.id, cap: token.cap, expiresAt: token.expiresAt, sample: token.sample };
  // "Under the hood": the real objects behind this row, so the claim can be checked.
  const hood = {
    sample: Boolean(token.sample),
    token: token.id,
    cap: token.cap,
    expiresAt: token.expiresAt,
    paymentMethod: token.paymentMethod || null,
    savedCard: Boolean(perm.wallet) && !token.fellBack,
    asked,
    decidedBy: r.blocked ? r.by || 'stripe' : 'stripe',
    paymentIntent: r.blocked ? r.pi || null : r.id,
    piStatus: r.piStatus || null,
    code: r.code || null,
    declineCode: r.declineCode || null,
    message: r.blocked ? r.why : null,
  };
  if (r.blocked) {
    return {
      status: 'blocked',
      asked,
      cap: s.cap,
      pass,
      test: test === true,
      why: test === true ? `Test: a fresh pass for ${dollars(s.cap)}, and the store tried ${dollars(asked)}.` : asked > s.cap ? `What-if: the checkout came to ${dollars(asked)}, ${dollars(asked - s.cap)} more than you approved (a made-up fee, not a real one from this store). The pass refused it.` : r.why,
      railsMissed: Boolean(r.railsMissed),
      hood,
    };
  }
  // A test can never end in a charge: the amount is over the pass by design. If it somehow went through, it was refunded above.
  if (test === true) return { status: 'blocked', test: true, asked, cap: s.cap, pass, why: 'The charge went through, which should never happen.', railsMissed: true, hood };
  return { status: 'paid', amount: r.amount, payment: r.id, pass, sample: Boolean(r.sample), hood };
});

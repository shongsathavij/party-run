// Stripe, in test mode only, with plain fetch (no SDK). Without a key, every call is
// simulated with the same rules and labeled as sample data.
//
// The flow for each store:
//   1. mint: a shared payment token for this store only, capped at what the parent
//      approved, expiring in TOKEN_MINUTES. In test mode Stripe's test helper stands in
//      for the agent issuing a token to the store's Stripe profile.
//   2. charge: the store creates and confirms a PaymentIntent with that token, for
//      whatever its checkout says. If that's over the cap, the token should refuse it.
//   3. refund: if the store cancels later.
import { randomUUID } from 'node:crypto';
import { TOKEN_MINUTES } from '../../lib/rules.js';

export function stripeKey() {
  const k = process.env.STRIPE_SECRET_KEY || '';
  if (!k) return null;
  if (!k.startsWith('sk_test_')) throw new Error('Party Run only runs on a Stripe test key (sk_test_…). Refusing a live key.');
  return k;
}

const PREVIEW = process.env.STRIPE_PREVIEW_VERSION || '2026-09-30.preview';

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object' && !Array.isArray(v)) form(v, key, out);
    else if (Array.isArray(v)) v.forEach((x) => out.append(`${key}[]`, x));
    else out.append(key, String(v));
  }
  return out;
}

async function call(path, params, { method = 'POST', preview = false, idem } = {}) {
  const headers = { Authorization: `Bearer ${stripeKey()}`, 'Content-Type': 'application/x-www-form-urlencoded' };
  if (preview) headers['Stripe-Version'] = PREVIEW;
  if (idem) headers['Idempotency-Key'] = idem;
  const r = await fetch(`https://api.stripe.com${path}`, { method, headers, body: method === 'GET' ? undefined : form(params || {}) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(data.error?.message || `Stripe ${r.status}`);
    e.stripe = data.error || {};
    throw e;
  }
  return data;
}

// The test helper sometimes needs the preview API version; try without it, then with it.
async function previewCall(path, params, opts) {
  try {
    return await call(path, params, opts);
  } catch (e) {
    if (!/unrecognized|not found|preview|version|unknown/i.test(e.message)) throw e;
    return call(path, params, { ...opts, preview: true });
  }
}

export async function mint({ store, cap, ref }) {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_MINUTES * 60;
  if (!stripeKey()) return { id: `spt_sample_${randomUUID().slice(0, 10)}`, cap, expiresAt, sample: true };
  const t = await previewCall('/v1/test_helpers/shared_payment/granted_tokens', {
    payment_method: 'pm_card_visa',
    usage_limits: { currency: 'usd', max_amount: cap, expires_at: expiresAt },
    // The test helper takes payment_method, usage_limits, customer and shared_metadata
    // only (no seller_details), so the store and run go in shared_metadata.
    shared_metadata: { app: 'party-run', store, ref },
  });
  return { id: t.id, cap: t.usage_limits?.max_amount ?? cap, expiresAt: t.usage_limits?.expires_at ?? expiresAt, sample: false };
}

// What happened when the store tried to charge. `blocked` means the token refused it.
export async function charge({ token, amount, store, permId, description }) {
  if (!stripeKey() || token.sample) {
    if (amount > token.cap) return { blocked: true, why: 'The pass refused it: more than its limit.' };
    return { id: `pi_sample_${randomUUID().slice(0, 10)}`, amount, sample: true };
  }
  try {
    const pi = await previewCall('/v1/payment_intents', {
      amount,
      currency: 'usd',
      confirm: 'true',
      payment_method_types: ['card'],
      shared_payment_granted_token: token.id,
      description,
      metadata: { app: 'party-run', store, permission: permId, token: token.id },
    }, { idem: `${token.id}:${amount}` });
    if (pi.status !== 'succeeded' && pi.status !== 'requires_capture') return { blocked: true, why: `Stripe left it ${pi.status}.` };
    // Defense in depth: if the rails ever let an over-cap charge through, undo it at once.
    if (amount > token.cap) {
      await call('/v1/refunds', { payment_intent: pi.id });
      return { blocked: true, why: 'Stripe accepted a charge over the limit, so we refunded it right away.', railsMissed: true };
    }
    return { id: pi.id, amount: pi.amount, sample: false };
  } catch (e) {
    return { blocked: true, why: e.message, code: e.stripe?.code || e.stripe?.decline_code || null };
  }
}

export async function refund({ paymentIntent }) {
  if (!stripeKey() || paymentIntent.startsWith('pi_sample_')) return { id: `re_sample_${randomUUID().slice(0, 8)}`, sample: true };
  const pi = await call(`/v1/payment_intents/${encodeURIComponent(paymentIntent)}`, null, { method: 'GET' });
  if (pi.metadata?.app !== 'party-run') throw new Error("That payment isn't one of Party Run's.");
  const r = await call('/v1/refunds', { payment_intent: paymentIntent }, { idem: `refund:${paymentIntent}` });
  return { id: r.id, amount: r.amount, sample: false };
}

import { stripeKey } from './_lib/stripe.js';

export default function handler(req, res) {
  let stripe = false, stripeError = null;
  try {
    stripe = Boolean(stripeKey());
  } catch (e) {
    stripeError = e.message;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ live: { ai: Boolean(process.env.ANTHROPIC_API_KEY), stripe }, stripeError });
}

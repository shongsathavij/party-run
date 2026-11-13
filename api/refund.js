// A store cancels after it's been paid (the "rental cancels" curveball): refund the payment.
import { open } from './_lib/permit.js';
import { refund } from './_lib/stripe.js';
import { post, fail } from './_lib/http.js';

export default post(async ({ permission, signature, payment }) => {
  open(permission, signature); // only someone holding a real permission can ask
  if (typeof payment !== 'string' || !/^pi_/.test(payment)) throw fail('Missing the payment.');
  const r = await refund({ paymentIntent: payment });
  return { status: 'refunded', refund: r.id, sample: Boolean(r.sample) };
});

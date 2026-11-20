// Onboarding: save the parent's card once, before the agent ever shops. Test mode only:
// Stripe's test Visa is saved to a new Customer. Nothing is charged here.
import { saveCard } from './_lib/stripe.js';
import { post } from './_lib/http.js';

export default post(async () => {
  const w = await saveCard();
  return { wallet: w };
});

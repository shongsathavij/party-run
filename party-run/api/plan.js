// "Plan it": the agent turns the request into a cart. Nothing is bought here.
import { planParty } from './_lib/agent.js';
import { post, fail, isoDate, serverToday } from './_lib/http.js';

export default post(async ({ prompt, today }) => {
  const text = String(prompt || '').trim();
  if (text.length < 3) throw fail('Tell the agent about the party: when, how many kids, what you want.');
  const t0 = Date.now();
  const r = await planParty({ prompt: text.slice(0, 1200), today: isoDate(today) || serverToday() });
  console.log(`[plan] ${r.mode} ${Date.now() - t0}ms${r.why ? ` (${String(r.why[0]).slice(0, 80)})` : ''}`);
  return { mode: r.mode, cart: r.cart };
});

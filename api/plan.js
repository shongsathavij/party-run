// "Plan it": the agent turns the request into a cart. Nothing is bought here.
import { planParty, rulesAgent, flagTheme } from './_lib/agent.js';
import { post, fail, isoDate, serverToday } from './_lib/http.js';
import { allowClaude } from './_lib/limits.js';
import { cleanPlant } from '../lib/catalog.js';

export default post(async ({ prompt, today: day, plant: rawPlant }, req) => {
  const plant = cleanPlant(rawPlant) || null;
  const text = String(prompt || '').trim();
  if (text.length < 3) throw fail('Tell the agent about the party: when, how many kids, what you want.');
  const t0 = Date.now();
  const date = isoDate(day) || serverToday();
  const live = Boolean(process.env.ANTHROPIC_API_KEY);
  const r = !live || allowClaude(req)
    ? await planParty({ prompt: text.slice(0, 1200), today: date, plant })
    : { ...rulesAgent(text.slice(0, 1200), date, { plant }), mode: 'limited' };
  const u = r.usage ? ` ${r.usage.turns} turns, ${r.usage.input_tokens}+${r.usage.output_tokens} tokens` : '';
  console.log(`[plan] ${r.mode} ${Date.now() - t0}ms${u}${r.why ? ` (${String(r.why[0]).slice(0, 80)})` : ''}`);
  // Off-theme items are flagged. If the parent asked for that thing by name (a bounce house,
  // a piñata), it needs their OK before anything can be approved.
  flagTheme(r.cart, text, date);
  // How the visitor's planted text fared, layer by layer.
  const trick = plant
    ? { text: plant, ai: r.mode === 'claude' || (r.mode === 'fallback' && r.fallback !== 'error'), reported: r.cart.ignored.length > 0, sentBack: Boolean(r.retried), tookOver: r.mode === 'fallback' && Boolean(r.retried) }
    : null;
  // Why the rules agent stepped in, so the page can say what really happened.
  const fallback = r.mode === 'fallback' ? { kind: r.fallback || 'checks', why: String(r.why?.[0] || '').slice(0, 200) } : null;
  return { mode: r.mode, cart: r.cart, trick, fallback };
});

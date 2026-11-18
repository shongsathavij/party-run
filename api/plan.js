// "Plan it": the agent turns the request into a cart. Nothing is bought here.
import { planParty, rulesAgent, readRequest } from './_lib/agent.js';
import { post, fail, isoDate, serverToday } from './_lib/http.js';
import { cleanPlant, byId, offTheme } from '../lib/catalog.js';

// Spend guard for the public demo: each visitor gets a few Claude plans an hour, and each
// server instance a daily ceiling. Past either, the rules agent plans instead (free).
// Counters live in memory, so they reset when Vercel starts a new instance: a brake, not
// a wall. The real wall is the spend limit on the Anthropic account.
// PARTY_AGENT=rules turns Claude off entirely.
const PER_VISITOR_PER_HOUR = Number(process.env.PLANS_PER_VISITOR_HOUR || 5);
const PER_DAY = Number(process.env.PLANS_PER_DAY || 60);
const visitors = new Map();
let day = '', today = 0;

function allowClaude(req) {
  if (process.env.PARTY_AGENT === 'rules') return false;
  const d = serverToday();
  if (d !== day) { day = d; today = 0; visitors.clear(); }
  if (today >= PER_DAY) return false;
  const ip = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || 'local';
  const hourAgo = Date.now() - 3600e3;
  const times = (visitors.get(ip) || []).filter((t) => t > hourAgo);
  if (times.length >= PER_VISITOR_PER_HOUR) return false;
  visitors.set(ip, [...times, Date.now()]);
  today++;
  return true;
}

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
  const asked = readRequest(text, date);
  r.cart.theme = asked.theme;
  for (const i of r.cart.items) {
    i.offTheme = offTheme(byId[i.id], asked.theme);
    i.needsOk = i.offTheme && asked.named.includes(i.category);
  }
  // How the visitor's planted text fared, layer by layer.
  const trick = plant
    ? { text: plant, ai: r.mode === 'claude' || (r.mode === 'fallback' && r.fallback !== 'error'), reported: r.cart.ignored.length > 0, sentBack: Boolean(r.retried), tookOver: r.mode === 'fallback' && Boolean(r.retried) }
    : null;
  // Why the rules agent stepped in, so the page can say what really happened.
  const fallback = r.mode === 'fallback' ? { kind: r.fallback || 'checks', why: String(r.why?.[0] || '').slice(0, 200) } : null;
  return { mode: r.mode, cart: r.cart, trick, fallback };
});

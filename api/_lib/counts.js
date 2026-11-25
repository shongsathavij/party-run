// Anonymous usage counts: event name + day -> a number. Nothing else is stored: no text anyone
// typed, no IP address, no device or visitor id. Backed by Upstash Redis (REST) when its env vars
// exist (Vercel's Upstash integration sets them); without them, counting is a no-op.

export const EVENTS = [
  'visit', // the page loaded
  'plan', 'plan_error', // a cart came back, or the request failed
  'mode_claude', 'mode_fallback', 'mode_rules', 'mode_limited', // who planned: Claude, rules after Claude failed, rules with no key, rules past the visitor limit
  'trick_tried', 'trick_caught', // a visitor planted text; the agent reported it
  'edited', 'swapped', 'qty_changed', 'added', // changes before approval: worded, swap, + / -, add a missing thing
  'kept_off_theme', 'dropped_off_theme', // her answer on an off-theme item she asked for
  'approved', 'approved_unchanged', // approved the cart; approved it exactly as the agent planned it
  'limit_100', 'limit_always', 'limit_never', // the check-with-me choice at approval
  'store_paid', 'stopped_to_check', 'skipped', 'paid_after_all', 'found_another', 'raised',
  'party_complete', 'party_incomplete', // when she opens the receipt
  'test_over_limit', 'stripe_refused', 'over_limit_through', 'test_cancel', // "Test the limits"
  'receipt_opened', 'receipt_copied', 'receipt_printed',
  'permission_off', // she turned off her permission from the receipt
];

const DAYS_KEPT = 180;
const P = 'pc'; // key prefix

function store() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

export async function pipeline(cmds) {
  const s = store();
  if (!s) return null;
  const r = await fetch(`${s.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`Counter store ${r.status}`);
  return r.json();
}

// Los Angeles days, so "today" matches the people using it.
export const laDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

export async function count(event, day = laDay()) {
  if (!EVENTS.includes(event)) return false;
  const key = `${P}:${day}:${event}`;
  await pipeline([['INCR', key], ['EXPIRE', key, String(DAYS_KEPT * 86400)], ['INCR', `${P}:total:${event}`]]);
  return true;
}

export const enabled = () => Boolean(store());

// Totals since the start, plus each of the last `days` days.
export async function read(days = 14) {
  const list = Array.from({ length: days }, (_, i) => laDay(new Date(Date.now() - i * 86400000)));
  const keys = [...EVENTS.map((e) => `${P}:total:${e}`), ...list.flatMap((d) => EVENTS.map((e) => `${P}:${d}:${e}`))];
  const res = await pipeline([['MGET', ...keys]]);
  const vals = (res?.[0]?.result || []).map((v) => Number(v) || 0);
  const totals = Object.fromEntries(EVENTS.map((e, i) => [e, vals[i]]));
  const byDay = list.map((d, j) => ({ day: d, ...Object.fromEntries(EVENTS.map((e, i) => [e, vals[EVENTS.length * (j + 1) + i]])) }));
  return { totals, byDay };
}

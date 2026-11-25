// The usage counts as a small private page: /api/stats?key=YOUR_STATS_KEY (&format=json for raw).
// Only counts by event and day (nothing anyone typed). Needs STATS_KEY set in Vercel.
import { read, enabled, EVENTS } from './_lib/counts.js';
import { timingSafeEqual } from 'node:crypto';

const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');

export default async function handler(req, res) {
  const want = process.env.STATS_KEY || '';
  const got = String(req.query?.key || '');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!want || !got || !same(want, got)) return res.status(404).send('Not found');
  if (!enabled()) return res.status(200).send('Counting is off: connect Upstash Redis in Vercel (Storage) to turn it on.');
  const { totals: t, byDay } = await read(14);
  if (req.query.format === 'json') return res.status(200).json({ totals: t, byDay });

  const plans = t.plan || 0;
  const ai = t.mode_claude + t.mode_fallback;
  const headline = [
    ['Carts approved unchanged', `${t.approved_unchanged} of ${t.approved} approved (${pct(t.approved_unchanged, t.approved)})`],
    ['Over-limit charges that got through', `${t.over_limit_through} (should always be 0)`],
  ];
  const rows = [
    ['Visits', t.visit],
    ['Plans', `${plans} (${pct(plans, t.visit)} of visits)`],
    ['Approved', `${t.approved} (${pct(t.approved, plans)} of plans)`],
    ['Planned by Claude', t.mode_claude],
    ['Rules agent after Claude failed', `${t.mode_fallback} (${pct(t.mode_fallback, ai)} of AI plans)`],
    ['Rules agent: no key / over the visitor limit', `${t.mode_rules} / ${t.mode_limited}`],
    ['Failed requests', t.plan_error],
    ['Tried to trick the agent / it reported the text', `${t.trick_tried} / ${t.trick_caught}`],
    ['Changes: worded, swap, + / −, add', [t.edited, t.swapped, t.qty_changed, t.added].join(', ')],
    ['Off-theme item: kept / dropped', `${t.kept_off_theme} / ${t.dropped_off_theme}`],
    ['Check with me: $100 / always / never', [t.limit_100, t.limit_always, t.limit_never].join(' / ')],
    ['Stores paid', t.store_paid],
    ['Stopped to check / skipped / paid after all', [t.stopped_to_check, t.skipped, t.paid_after_all].join(' / ')],
    ['Found another / approved more', `${t.found_another} / ${t.raised}`],
    ['Party complete / incomplete', `${t.party_complete} / ${t.party_incomplete}`],
    ['Tested $20 over / Stripe refused', `${t.test_over_limit} / ${t.stripe_refused}`],
    ['Tested a cancellation', t.test_cancel],
    ['Receipt opened / copied / printed', [t.receipt_opened, t.receipt_copied, t.receipt_printed].join(' / ')],
  ];
  const head = ['Day', 'visit', 'plan', 'approved', 'approved_unchanged', 'store_paid', 'trick_tried', 'mode_fallback', 'over_limit_through'];
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const table = (rs) => `<table>${rs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Piece of Cake: usage</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:24px;color:#161412;background:#fff}h1{font-size:22px}h2{font-size:17px}table{border-collapse:collapse;margin:12px 0 28px}td,th{padding:6px 12px;border-bottom:1px solid #ECE9E4;text-align:left}th{font-weight:600}td:last-child{font-variant-numeric:tabular-nums}.wrap{overflow-x:auto}</style>
<h1>Piece of Cake: usage</h1><p>Anonymous counts only. Days are LA time.</p>
<h2>The two numbers</h2>${table(headline)}
<h2>Everything else</h2>${table(rows)}
<h2>Last 14 days</h2><div class="wrap"><table><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${byDay.map((d) => `<tr>${head.map((h) => `<td>${h === 'Day' ? d.day : d[h]}</td>`).join('')}</tr>`).join('')}</table></div>
<p style="color:#57524C">Events counted: ${EVENTS.join(', ')}.</p>`);
}

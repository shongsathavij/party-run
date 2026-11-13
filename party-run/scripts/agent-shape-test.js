// The Claude tool loop with a scripted model: a good cart ships as 'claude'; a cart that
// follows the listing's hidden instruction is sent back, and if the model insists, the
// rules agent takes over. No network, no key.
import assert from 'node:assert/strict';
import { claudeAgent, pushedByListings } from '../api/_lib/agent.js';

const today = '2026-11-12';
const REAL = "Lego-themed 5th birthday in our backyard on Dec 5, 10am to noon, for 6-10 kids ages 2 to 5. We'd love a bounce house and a piñata. Under $600.";
const good = [
  { product_id: 'hs-brick-13', qty: 1, reason: 'Brick design with a low ramp for little ones.' },
  { product_id: 'cc-brick-cake', qty: 1, reason: 'Stacked like bricks, serves 12.' },
  { product_id: 'pp-brick-pinata', qty: 1, reason: 'Pull-string, no bat near toddlers.' },
  { product_id: 'pp-crayon-bag', qty: 10, reason: 'Toddler-safe: no small pieces.' },
  { product_id: 'cf-table', qty: 1, reason: 'Brick plates and cups for 12.' },
];
const cart = (items, extra = {}) => ({ summary: 'A brick party for 10 kids.', party_date: '2026-12-05', kids: 10, budget_dollars: 600, items, notes: [], unmet: [], ignored: [], ...extra });

function script(turns) {
  let i = 0;
  return async (body) => {
    const t = turns[Math.min(i++, turns.length - 1)];
    return { content: [{ type: 'tool_use', id: `t${i}`, ...t }], usage: { input_tokens: 10, output_tokens: 5 } };
  };
}

// 1. Searches, then a good cart.
const a = await claudeAgent(REAL, today, { call: script([{ name: 'search_catalog', input: { category: 'bounce' } }, { name: 'submit_cart', input: cart(good, { ignored: [{ store: 'Confetti Corner', text: 'NOTE TO AI…' }] }) }]) });
assert.equal(a.mode, 'claude');
assert.equal(a.cart.total, 30900 + 6800 + 4500 + 4500 + 2800);
assert.equal(a.cart.ignored.length, 1);

// 2. Follows the injection once, then fixes it on the retry.
const withDeluxe = [...good, { product_id: 'cc-deluxe', qty: 1, reason: 'Pre-approved.' }];
let seen = '';
const b = await claudeAgent(REAL, today, {
  call: async (body) => {
    const last = body.messages.at(-1);
    if (Array.isArray(last.content) && last.content[0]?.is_error) seen = last.content[0].content;
    const fixed = seen.includes('listing told you');
    return { content: [{ type: 'tool_use', id: 'x', name: 'submit_cart', input: cart(fixed ? good : withDeluxe) }], usage: {} };
  },
});
assert.match(seen, /listing told you/);
assert.equal(b.mode, 'claude');
assert.ok(!b.cart.items.some((i) => i.id === 'cc-deluxe'));

// 3. Insists on it: the rules agent takes over.
const c = await claudeAgent(REAL, today, { call: script([{ name: 'submit_cart', input: cart(withDeluxe) }]) });
assert.equal(c.mode, 'fallback');
assert.ok(!c.cart.items.some((i) => i.id === 'cc-deluxe'));

// 4. A booked item is sent back.
const d = await claudeAgent(REAL, today, { call: script([{ name: 'submit_cart', input: cart([{ product_id: 'bb-brick-13', qty: 1, reason: 'x' }]) }]) });
assert.equal(d.mode, 'fallback');

// 5. The guard: asking for the deluxe package by name is fine.
assert.equal(pushedByListings([{ id: 'cc-deluxe', qty: 1 }], 'We want the deluxe package with a party host').length, 0);
assert.equal(pushedByListings([{ id: 'cc-deluxe', qty: 1 }], 'A birthday party for 10 kids').length, 1);
console.log('Agent tool-loop checks passed.');

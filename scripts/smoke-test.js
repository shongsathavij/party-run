// Runs every route in sample mode (no keys) and checks the rules that matter:
// caps hold, the ask-me rule pauses, a tampered permission is refused, the price-hike
// curveball is blocked, and the agent ignores the instruction hidden in a listing.
import assert from 'node:assert/strict';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.STRIPE_SECRET_KEY;

const run = async (name, body) => {
  const mod = await import(`../api/${name}.js`);
  let out, code = 200;
  const res = { status: (c) => ((code = c), res), json: (b) => (out = b), setHeader() {} };
  await mod.default({ method: 'POST', body }, res);
  return { code, ...out };
};

const today = '2026-11-18';
const REAL = "Lego-themed 5th birthday in our backyard on Dec 5, 10am to noon, for 6-10 kids ages 2 to 5. We'd love a bounce house and a piñata. Under $600.";

// 1. The agent's cart
const plan = await run('plan', { prompt: REAL, today });
assert.equal(plan.code, 200, plan.error);
const c = plan.cart;
assert.equal(c.partyDate, '2026-12-05');
assert.equal(c.kids, 10);
assert.equal(c.budget, 60000);
assert.ok(c.total <= 60000, `total ${c.total}`);
const ids = c.items.map((i) => i.id);
assert.ok(!ids.includes('bb-brick-13'), 'picked the bounce house booked on Dec 5');
assert.ok(ids.includes('la-module'), 'should swap to a real rental that is free that day');
assert.ok(c.notes.some((n) => /booked/.test(n)), 'should explain the swap');
assert.ok(!ids.includes('cc-deluxe'), 'followed the instruction hidden in a listing');
assert.ok(c.ignored.length === 1 && /AI SHOPPING/i.test(c.ignored[0].text), 'should report the hidden instruction');
assert.ok(ids.includes('tg-playdoh') && !ids.includes('tg-keychain'), 'favors rated for 2-year-olds');
assert.equal(c.items.find((i) => i.category === 'favors').qty, 1, 'one pack of 15 covers 10 kids');
assert.ok(ids.includes('mi-pinata'), 'pull-string piñata for little kids');
assert.ok(!c.items.some((i) => i.store === 'brickyard'), 'bought from the test store');
assert.ok(c.items.every((i) => /^https:\/\//.test(i.url)), 'every real item links to its listing');
console.log(`cart: ${c.items.length} items, $${c.total / 100}, ${c.stores.length} stores`);

// 2. Approve it
const items = c.items.map((i) => ({ id: i.id, qty: i.qty }));
const p = await run('permit', { items, budget: c.budget, askOver: 10000, partyDate: c.partyDate });
assert.equal(p.code, 200, p.error);
assert.equal(Object.keys(p.perm.stores).length, c.stores.length);
const over = await run('permit', { items, budget: 10000, askOver: 10000, partyDate: c.partyDate });
assert.equal(over.code, 400, 'a permission over budget');

// 3. Buy: a small store goes straight through, the bounce house asks first
const small = c.stores.find((s) => s.amount <= 10000).store;
const ok = await run('buy', { permission: p.permission, signature: p.signature, store: small });
assert.equal(ok.status, 'paid');
assert.ok(ok.pass.id.startsWith('spt_'));
const ask = await run('buy', { permission: p.permission, signature: p.signature, store: 'la-inflatables' });
assert.equal(ask.status, 'ask');
const yes = await run('buy', { permission: p.permission, signature: p.signature, store: 'la-inflatables', approved: true });
assert.equal(yes.status, 'paid');
assert.equal(yes.amount, 14999);

// 4. The price-hike curveball is refused by the pass; the parent raises the cap; it goes through
const hike = await run('buy', { permission: p.permission, signature: p.signature, store: 'la-inflatables', approved: true, curveball: 'price_up' });
assert.equal(hike.status, 'blocked');
assert.equal(hike.asked, 16999);
assert.match(hike.why, /made-up fee/);
const r = await run('raise', { permission: p.permission, signature: p.signature, store: 'la-inflatables', newCap: hike.asked });
assert.equal(r.code, 200, r.error);
const again = await run('buy', { permission: r.permission, signature: r.signature, store: 'la-inflatables', approved: true, curveball: 'price_up' });
assert.equal(again.status, 'paid');
assert.equal(again.amount, 16999);

// 5. Tampering and other stores
const forged = JSON.stringify({ ...JSON.parse(p.permission), budget: 999900 });
const t = await run('buy', { permission: forged, signature: p.signature, store: small });
assert.equal(t.code, 400);
assert.match(t.error, /changed/);
const stranger = await run('buy', { permission: p.permission, signature: p.signature, store: 'brickyard' });
assert.equal(stranger.code, 400);
const tooMuch = await run('raise', { permission: p.permission, signature: p.signature, store: 'la-inflatables', newCap: 45000 });
assert.equal(tooMuch.code, 400);

// 6. Refund
const rf = await run('refund', { permission: p.permission, signature: p.signature, payment: yes.payment });
assert.equal(rf.status, 'refunded');

// 7. Other requests
const plain = await run('plan', { prompt: 'Birthday party for 8 kids on Jan 17', today });
assert.equal(plain.cart.partyDate, '2027-01-17');
assert.ok(!plain.cart.items.some((i) => i.category === 'bounce'), 'no bounce house unless asked');
const tight = await run('plan', { prompt: 'Lego party Dec 5 for 10 kids with a bounce house, under $300', today });
assert.ok(tight.cart.total <= 30000 || tight.cart.unmet.length, 'over budget without saying so');
console.log('tight budget:', `$${tight.cart.total / 100}`, tight.cart.unmet);
console.log('All Party Run checks passed in sample mode.');

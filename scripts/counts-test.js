// Anonymous usage counts with a stand-in for Upstash: valid events count, unknown ones don't,
// nothing but the event name is sent, the stats page needs its key, and with no store it's a no-op.
import assert from 'node:assert/strict';

const db = new Map();
const sent = [];
globalThis.fetch = async (url, opts) => {
  const cmds = JSON.parse(opts.body);
  sent.push(cmds);
  const out = cmds.map(([op, ...args]) => {
    if (op === 'INCR') { db.set(args[0], (Number(db.get(args[0])) || 0) + 1); return { result: db.get(args[0]) }; }
    if (op === 'EXPIRE') return { result: 1 };
    if (op === 'EXISTS') return { result: db.has(args[0]) ? 1 : 0 };
    if (op === 'SET') { if (args.includes('NX') && db.has(args[0])) return { result: null }; db.set(args[0], args[1]); return { result: 'OK' }; }
    if (op === 'DEL') { db.delete(args[0]); return { result: 1 }; }
    if (op === 'MGET') return { result: args.map((k) => (db.has(k) ? String(db.get(k)) : null)) };
    throw new Error(op);
  });
  return { ok: true, json: async () => out };
};

const call = async (mod, req) => {
  let code = 200, body = null;
  const headers = {};
  const res = { status: (c) => ((code = c), res), end: (b) => ((body = b), res), send: (b) => ((body = b), res), json: (b) => ((body = b), res), setHeader: (k, v) => (headers[k] = v) };
  await mod.default(req, res);
  return { code, body, headers };
};

// No store configured: counting quietly does nothing.
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.KV_REST_API_URL;
const track = await import('../api/track.js');
assert.equal((await call(track, { method: 'POST', body: '{"e":"visit"}' })).code, 204);
assert.equal(sent.length, 0);

process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
process.env.STATS_KEY = 'secret-stats';
for (const e of ['visit', 'visit', 'plan', 'approved', 'approved_unchanged', 'mode_claude', 'trick_tried']) await call(track, { method: 'POST', body: JSON.stringify({ e }) });
await call(track, { method: 'POST', body: JSON.stringify({ e: 'my son Alex turns 5' }) }); // not an event
await call(track, { method: 'POST', body: 'not json' });
assert.equal((await call(track, { method: 'GET' })).code, 405);
assert.equal(db.get('pc:total:visit'), 2);
assert.equal(db.get('pc:total:plan'), 1);
assert.ok(![...db.keys()].some((k) => /Alex/.test(k)), 'free text was stored');
assert.ok(sent.flat(2).every((x) => !/Alex/.test(String(x))), 'free text was sent');

const stats = await import('../api/stats.js');
assert.equal((await call(stats, { query: {} })).code, 404);
assert.equal((await call(stats, { query: { key: 'wrong-stats!' } })).code, 404);
const page = await call(stats, { query: { key: 'secret-stats' } });
assert.equal(page.code, 200);
assert.match(page.body, /Visits<\/th><td>2/);
assert.match(page.body, /Carts approved unchanged<\/th><td>1 of 1 approved \(100%\)/);
const json = await call(stats, { query: { key: 'secret-stats', format: 'json' } });
assert.equal(json.body.totals.trick_tried, 1);
assert.equal(json.body.byDay.length, 14);
assert.equal(json.body.byDay[0].visit, 2);

// The permission ledger uses the same store, so every server instance agrees.
const ledger = await import('../api/_lib/ledger.js');
assert.equal(ledger.durable(), true);
assert.equal(await ledger.claim('perm_1', 'target'), true);
assert.equal(await ledger.claim('perm_1', 'target'), false, 'a store is paid once per permission');
await ledger.release('perm_1', 'target');
assert.equal(await ledger.claim('perm_1', 'target'), true, 'released when the store didn’t charge');
assert.equal(await ledger.isRevoked('perm_1'), false);
await ledger.revoke(['perm_1']);
assert.equal(await ledger.isRevoked('perm_1'), true);
assert.ok(db.has('pc:revoked:perm_1') && db.has('pc:used:perm_1:target'));
console.log('Usage-count and ledger checks passed.');

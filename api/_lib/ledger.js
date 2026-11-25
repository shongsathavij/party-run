// What a signed permission can't carry on its own: which stores it has already paid, and
// whether the parent turned it off. Upstash Redis when it's connected (the same store as the
// usage counts), so every server instance agrees; without it, this instance's memory (fine for
// sample mode and local runs, not a guarantee across instances). Keys hold ids and store names
// only, never amounts, cards or anything the parent typed.
import { pipeline, enabled } from './counts.js';

const KEEP = 60 * 86400; // longer than any permission lives (they end on the party date, at most a few weeks out)
const mem = new Set();
const rk = (id) => `pc:revoked:${id}`;
const uk = (id, store) => `pc:used:${id}:${store}`;

export const durable = () => enabled();

async function has(key) {
  if (!enabled()) return mem.has(key);
  const r = await pipeline([['EXISTS', key]]);
  return Number(r?.[0]?.result) === 1;
}

export const isRevoked = (id) => has(rk(id));

export async function revoke(ids) {
  for (const id of ids) mem.add(rk(id));
  if (enabled()) await pipeline(ids.map((id) => ['SET', rk(id), '1', 'EX', String(KEEP)]));
}

// One charge per store per permission. Claimed before the pass is made, so two taps (or two
// tabs) can't both pay; released if the store didn't end up charged.
export async function claim(id, store) {
  const key = uk(id, store);
  if (!enabled()) {
    if (mem.has(key)) return false;
    mem.add(key);
    return true;
  }
  const r = await pipeline([['SET', key, '1', 'NX', 'EX', String(KEEP)]]);
  return r?.[0]?.result === 'OK';
}

export async function release(id, store) {
  const key = uk(id, store);
  mem.delete(key);
  if (enabled()) await pipeline([['DEL', key]]);
}

// A permission the parent granted, signed by the server so the page can carry it around
// without being able to change it (a raised cap or an extra store breaks the signature).
import { createHmac, createHash, randomUUID, timingSafeEqual } from 'node:crypto';

function secret() {
  if (process.env.PERMISSION_SECRET) return process.env.PERMISSION_SECRET;
  // Without its own secret, derive one from the Stripe key (still server-only), or use a
  // sample secret when there's no key at all (sample mode moves no money).
  const base = process.env.STRIPE_SECRET_KEY || 'party-run-sample-mode';
  return createHash('sha256').update(`party-run-permission:${base}`).digest('hex');
}

const sign = (body) => createHmac('sha256', secret()).update(body).digest('base64url');

export function seal(perm) {
  const body = JSON.stringify({ ...perm, id: perm.id || `perm_${randomUUID().slice(0, 8)}` });
  return { permission: body, signature: sign(body) };
}

export function open(permission, signature) {
  if (typeof permission !== 'string' || typeof signature !== 'string') throw new Error('Missing permission.');
  const a = Buffer.from(sign(permission));
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("That permission was changed after you approved it, so it won't be used.");
  return JSON.parse(permission);
}

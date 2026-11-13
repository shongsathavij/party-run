// The parent OKs a higher price at one store. The new cap still can't push the party past
// the budget, and the permission is re-signed.
import { raise } from '../lib/rules.js';
import { open, seal } from './_lib/permit.js';
import { post, fail } from './_lib/http.js';

export default post(async ({ permission, signature, store, newCap }) => {
  const perm = open(permission, signature);
  if (!Number.isInteger(newCap) || newCap <= 0) throw fail('Missing the new amount.');
  const cur = perm.stores[store]?.cap || 0;
  if (newCap > Math.round(cur * 1.5)) throw fail('That is more than half again what you approved. Start a new cart instead.');
  const next = raise(perm, store, newCap); // throws if it would pass the budget
  const sealed = seal(next);
  return { ...sealed, perm: JSON.parse(sealed.permission) };
});

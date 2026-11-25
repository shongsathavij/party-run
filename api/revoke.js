// The parent turns off her permission (and any extra one she approved later): from now on the
// server makes no new pass under it, at any store. What was already paid doesn't change, and a
// refund still works. Only someone holding the signed permission can turn it off.
import { open } from './_lib/permit.js';
import { revoke, durable } from './_lib/ledger.js';
import { post, fail } from './_lib/http.js';

export default post(async ({ permits }) => {
  if (!Array.isArray(permits) || !permits.length || permits.length > 10) throw fail('Missing permission.');
  const ids = [...new Set(permits.map((p) => open(p?.permission, p?.signature).id))];
  await revoke(ids);
  return { ids, at: new Date().toISOString(), durable: durable() };
});

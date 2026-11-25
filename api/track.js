// Counts one anonymous event (see api/_lib/counts.js). The page sends it with sendBeacon, so
// it never slows anything down. Bad or unknown events are ignored, quietly.
import { count } from './_lib/counts.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    await count(String(body.e || ''));
  } catch (e) {
    console.log('[track] skipped:', e.message);
  }
  res.status(204).end();
}

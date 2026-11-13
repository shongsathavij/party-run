// Small helpers shared by the routes.
export function post(handler) {
  return async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      return res.status(200).json(await handler(body, req));
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message || 'Something went wrong.' });
    }
  };
}
export const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
// The server's own date (UTC). Good enough for "is the party still ahead?".
export const serverToday = () => new Date().toISOString().slice(0, 10);
export const isoDate = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

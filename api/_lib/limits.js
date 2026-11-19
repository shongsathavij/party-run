import { serverToday } from './http.js';

// Spend guard for the public demo: each visitor gets a few Claude plans an hour, and each
// server instance a daily ceiling. Past either, the rules agent plans instead (free).
// Counters live in memory, so they reset when Vercel starts a new instance: a brake, not
// a wall. The real wall is the spend limit on the Anthropic account.
// PARTY_AGENT=rules turns Claude off entirely.
const PER_VISITOR_PER_HOUR = Number(process.env.PLANS_PER_VISITOR_HOUR || 5);
const PER_DAY = Number(process.env.PLANS_PER_DAY || 60);
const visitors = new Map();
let day = '', today = 0;

export function allowClaude(req) {
  if (process.env.PARTY_AGENT === 'rules') return false;
  const d = serverToday();
  if (d !== day) { day = d; today = 0; visitors.clear(); }
  if (today >= PER_DAY) return false;
  const ip = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || 'local';
  const hourAgo = Date.now() - 3600e3;
  const times = (visitors.get(ip) || []).filter((t) => t > hourAgo);
  if (times.length >= PER_VISITOR_PER_HOUR) return false;
  visitors.set(ip, [...times, Date.now()]);
  today++;
  return true;
}


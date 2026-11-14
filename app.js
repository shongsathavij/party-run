// Party Run: ask → the agent's cart → what it may spend → the shopping run → the ledger.
// The page never decides what money moves: the server prices everything from the catalog,
// signs the parent's permission, and mints one capped pass per store.
import { STORES } from './lib/catalog.js';
import { DEFAULT_ASK_OVER } from './lib/rules.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (c) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const prettyDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const localISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Our real party: a building-brick 5th birthday in the backyard.
const REAL = "Lego-themed 5th birthday in our backyard on Dec 5, 10am to noon, for 6-10 kids ages 2 to 5. We'd love a bounce house and a piñata. Under $600.";

const ASK_CHOICES = [
  { v: 5000, label: '$50' },
  { v: 15000, label: '$150' },
  { v: 30000, label: '$300' },
  { v: 0, label: 'Ask every time' },
  { v: null, label: 'Never ask' },
];

const state = { config: null, cart: null, mode: null, askOver: DEFAULT_ASK_OVER, permission: null, signature: null, perm: null, rows: {}, busy: false };

async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Something went wrong. Try again?');
  return data;
}

// A generic toy brick in the store's color: the badge for each store.
const brick = (store) => {
  const c = STORES[store]?.color || '#DDD';
  return `<svg class="brick" viewBox="0 0 26 20" aria-hidden="true"><rect x="1" y="7" width="24" height="12" rx="2" fill="${c}" stroke="#161412" stroke-width="1.6"/><rect x="4.5" y="2.5" width="6" height="4.5" rx="1.2" fill="${c}" stroke="#161412" stroke-width="1.4"/><rect x="15.5" y="2.5" width="6" height="4.5" rx="1.2" fill="${c}" stroke="#161412" stroke-width="1.4"/></svg>`;
};

// ---------- asking ----------

const THINKING = ['Reading your message…', 'Checking who has bounce houses…', 'Looking at cakes…', 'Finding favors for little hands…', 'Reading the fine print…', 'Adding it all up…'];
let thinkTimer = null;
function thinking(on) {
  clearInterval(thinkTimer);
  $('#thinking').hidden = !on;
  if (!on) return;
  let n = 0;
  $('#thinkingLine').textContent = THINKING[0];
  thinkTimer = setInterval(() => ($('#thinkingLine').textContent = THINKING[(n = (n + 1) % THINKING.length)]), 1600);
}

async function plan(e) {
  e.preventDefault();
  const text = $('#askText').value.trim();
  const err = $('#askErr');
  err.hidden = true;
  if (text.length < 3) {
    err.textContent = 'Tell the agent about the party: when, how many kids, what you want.';
    err.hidden = false;
    return $('#askText').focus();
  }
  $('#ask').hidden = true;
  $('#chat').hidden = false;
  $('#myRequest').textContent = text;
  $('#cartBot').hidden = true;
  $('#startOver').hidden = true;
  thinking(true);
  try {
    const r = await api('/api/plan', { prompt: text, today: localISO() });
    thinking(false);
    state.cart = r.cart;
    state.mode = r.mode;
    renderCart();
    renderPermit();
  } catch (ex) {
    thinking(false);
    $('#chat').hidden = true;
    $('#ask').hidden = false;
    err.textContent = /fetch|network|load failed/i.test(ex.message) ? "Couldn't reach the agent. Try again?" : ex.message;
    err.hidden = false;
  }
}

// ---------- the cart ----------

function renderCart() {
  const c = state.cart;
  $('#cartSummary').textContent = c.summary || `A party for ${c.kids} kids.`;
  $('#cartNotes').innerHTML = c.notes.map((n) => `<li>${esc(n)}</li>`).join('');
  $('#shield').hidden = !c.ignored.length;
  $('#shieldText').innerHTML = c.ignored
    .map((x) => `A listing from ${esc(x.store)} tried to give me orders. I didn't follow them, and you approve everything anyway: <q>${esc(x.text)}</q>`)
    .join('<br><br>');
  $('#cartStores').innerHTML = c.stores
    .map((s) => {
      const items = c.items.filter((i) => i.store === s.store);
      return `<section class="store">
        <div class="store-head">${brick(s.store)}<div><div class="store-name">${esc(s.name)}</div><div class="store-kind">${esc(STORES[s.store].kind)}</div></div><span class="store-amt">${money(s.amount)}</span></div>
        <ul class="items">${items
          .map((i) => `<li><span>${i.qty > 1 ? `${i.qty} × ` : ''}${esc(i.name)}</span><span class="amt">${money(i.amount)}</span>${i.reason ? `<span class="why">${esc(i.reason)}</span>` : ''}</li>`)
          .join('')}</ul>
      </section>`;
    })
    .join('');
  $('#cartUnmet').hidden = !c.unmet.length;
  $('#cartUnmetList').innerHTML = c.unmet.map((u) => `<li>${esc(u)}</li>`).join('');
  $('#cartHow').hidden = state.mode === 'claude';
  $('#cartHow').textContent = state.mode === 'fallback' ? "Claude's cart didn't pass our checks, so this one is from the rules-based agent." : 'Sample agent: rules, not AI.';
  $('#cartBot').hidden = false;
  $('#startOver').hidden = false;
}

// ---------- what the agent may spend ----------

const budgetOf = (c) => c.budget || c.total;
const asksAt = (amount) => state.askOver === 0 || (state.askOver != null && amount > state.askOver);

function renderPermit() {
  const c = state.cart;
  $('#moneyCol').hidden = false;
  $('#permitSheet').hidden = false;
  $('#runSheet').hidden = true;
  const budget = budgetOf(c);
  $('#permitSub').textContent = `For ${prettyDate(c.partyDate)}. Nothing is charged until you say go.`;
  $('#permitTotal').textContent = money(c.total);
  $('#permitOf').textContent = c.budget ? `of your ${money(c.budget)} budget` : 'No budget given, so the cart is the limit.';
  $('#budgetBar div').style.width = `${Math.min(100, Math.round((c.total / budget) * 100))}%`;
  $('#caps').innerHTML = c.stores
    .map((s) => `<li>${brick(s.store)}<span>${esc(s.name)}</span>${asksAt(s.amount) ? '<span class="ask-tag">asks you</span>' : ''}<span class="cap">up to ${money(s.amount)}</span></li>`)
    .join('');
  $('#askChips').innerHTML = ASK_CHOICES.map((o) => `<button type="button" class="chip" role="radio" aria-checked="${o.v === state.askOver}" data-v="${o.v}">${o.label}</button>`).join('');
  $('#passNote').textContent = `Each store gets its own pass: good at that store only, up to its amount, for 30 minutes. Nothing can be bought after ${prettyDate(c.partyDate)}.`;
  $('#permitErr').hidden = true;
  $('#shopBtn').disabled = false;
}

// ---------- the shopping run ----------

function row(store) {
  let li = state.rows[store];
  if (!li) {
    li = document.createElement('li');
    $('#run').append(li);
    state.rows[store] = li;
  }
  return li;
}

function paint(store, { cls = '', amount, status, pass, acts = '' }) {
  const li = row(store);
  li.className = cls;
  li.innerHTML = `<div class="row">${cls === 'working' ? '<span class="spin" aria-hidden="true"></span>' : brick(store)}<b>${esc(STORES[store].name)}</b><span class="amt">${amount != null ? money(amount) : ''}</span></div>
    <span class="status">${status}</span>${pass ? `<span class="pass">${esc(pass)}</span>` : ''}${acts ? `<div class="acts">${acts}</div>` : ''}`;
  return li;
}

const passLine = (p, used) => `Pass ${p.id.slice(0, 18)}… · limit ${money(p.cap)} · ${used}`;

// Wait for the parent to tap one of a row's buttons.
const choice = (li) => new Promise((res) => li.querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => res(b.dataset.choice), { once: true })));

async function shop() {
  if (state.busy) return;
  state.busy = true;
  const c = state.cart;
  const btn = $('#shopBtn');
  btn.setAttribute('aria-busy', 'true');
  $('#permitErr').hidden = true;
  try {
    const p = await api('/api/permit', { items: c.items.map((i) => ({ id: i.id, qty: i.qty })), budget: c.budget, askOver: state.askOver, partyDate: c.partyDate });
    Object.assign(state, { permission: p.permission, signature: p.signature, perm: p.perm, rows: {}, paid: {} });
  } catch (ex) {
    $('#permitErr').textContent = ex.message;
    $('#permitErr').hidden = false;
    btn.removeAttribute('aria-busy');
    state.busy = false;
    return;
  }
  btn.removeAttribute('aria-busy');
  $('#permitSheet').hidden = true;
  $('#runSheet').hidden = false;
  $('#run').innerHTML = '';
  $('#ledger').hidden = true;
  $('#runTitle').textContent = 'Shopping…';
  $('#runSheet').scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' });

  // Smallest first, so the easy ones go through while you watch.
  const order = [...c.stores].sort((a, b) => a.amount - b.amount);
  for (const s of order) await buy(s.store, s.amount);

  finishRun();
  state.busy = false;
}

async function buy(store, amount, { approved = false } = {}) {
  paint(store, { cls: 'working', amount, status: `Making a pass for ${money(amount)}, good at this store only…` });
  await wait(calm() ? 0 : 650);
  let r;
  try {
    r = await api('/api/buy', { permission: state.permission, signature: state.signature, store, approved, curveball: $('#cbPrice').checked ? 'price_up' : null });
  } catch (ex) {
    paint(store, { cls: 'blocked', amount, status: esc(ex.message) });
    return;
  }

  if (r.status === 'paid') {
    state.paid[store] = { amount: r.amount, payment: r.payment };
    paint(store, { cls: 'paid', amount: r.amount, status: `Paid ${money(r.amount)}${r.sample ? ' (sample)' : ''}`, pass: passLine(r.pass, 'used once, now closed') });
    return;
  }

  if (r.status === 'ask') {
    const li = paint(store, {
      cls: 'asking',
      amount,
      status: `${money(amount)} is over your ask-me rule, so the agent is waiting for you.`,
      acts: `<button class="go" data-choice="yes">Approve ${money(amount)}</button><button class="ghost-btn" data-choice="no">Skip</button>`,
    });
    if ((await choice(li)) === 'yes') return buy(store, amount, { approved: true });
    paint(store, { amount: null, status: 'Skipped. Nothing charged.' });
    return;
  }

  if (r.status === 'blocked') {
    const more = r.asked - r.cap;
    const li = paint(store, {
      cls: 'blocked',
      amount: r.asked,
      status: esc(r.why),
      pass: passLine(r.pass, `refused ${money(r.asked)}${r.railsMissed ? ' (refunded at once)' : ''}`),
      acts: more > 0 ? `<button class="go" data-choice="raise">Approve ${money(more)} more</button><button class="ghost-btn" data-choice="no">Skip this store</button>` : '<button class="ghost-btn" data-choice="no">OK</button>',
    });
    if ((await choice(li)) === 'raise') {
      try {
        const up = await api('/api/raise', { permission: state.permission, signature: state.signature, store, newCap: r.asked });
        Object.assign(state, { permission: up.permission, signature: up.signature, perm: up.perm });
        return buy(store, r.asked, { approved: true });
      } catch (ex) {
        paint(store, { cls: 'blocked', amount: null, status: `${esc(ex.message)} Skipped. Nothing charged.` });
        return;
      }
    }
    paint(store, { amount: null, status: 'Skipped. Nothing charged.' });
    return;
  }

  paint(store, { cls: 'blocked', amount, status: esc(r.why || 'Not bought.') });
}

function spentTotal() {
  return Object.values(state.paid).reduce((a, p) => a + (p.refunded ? 0 : p.amount), 0);
}

function finishRun() {
  const c = state.cart;
  const paid = Object.keys(state.paid).length;
  const all = c.stores.length;
  $('#runTitle').textContent = paid === all ? 'All done' : paid ? `${paid} of ${all} stores paid` : 'Nothing was bought';
  $('#runSub').textContent = `For ${prettyDate(c.partyDate)}.`;
  $('#ledger').hidden = false;
  renderSpent();
  $('#ledgerNote').textContent = paid
    ? 'Each pass was good for one store, one charge, and 30 minutes, so nothing else can be charged.'
    : 'No store was charged.';
  const rental = Object.keys(state.paid).find((s) => /rentals/i.test(STORES[s].kind));
  $('#cancelRental').hidden = !rental;
  $('#cancelRental').dataset.store = rental || '';
}

function renderSpent() {
  const c = state.cart;
  $('#spent').textContent = money(spentTotal());
  $('#spentOf').textContent = c.budget ? `spent of your ${money(c.budget)} budget` : 'spent';
}

async function cancelRental() {
  const store = $('#cancelRental').dataset.store;
  const p = state.paid[store];
  if (!p || p.refunded) return;
  const b = $('#cancelRental');
  b.setAttribute('aria-busy', 'true');
  try {
    const r = await api('/api/refund', { permission: state.permission, signature: state.signature, payment: p.payment });
    p.refunded = true;
    paint(store, { cls: 'refunded', amount: p.amount, status: `${esc(STORES[store].name)} cancelled (rain in the forecast). ${money(p.amount)} refunded to your card${r.sample ? ' (sample)' : ''}.` });
    renderSpent();
    b.hidden = true;
  } catch (ex) {
    $('#ledgerNote').textContent = ex.message;
  } finally {
    b.removeAttribute('aria-busy');
  }
}

// ---------- wiring ----------

function startOver() {
  if (state.busy) return;
  Object.assign(state, { cart: null, permission: null, signature: null, perm: null, rows: {}, paid: {} });
  $('#chat').hidden = true;
  $('#moneyCol').hidden = true;
  $('#ask').hidden = false;
  $('#askText').focus();
}

function bind() {
  $('#askForm').addEventListener('submit', plan);
  $('#useReal').addEventListener('click', () => {
    $('#askText').value = REAL;
    $('#askText').focus();
  });
  $('#askChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    state.askOver = b.dataset.v === 'null' ? null : Number(b.dataset.v);
    renderPermit();
  });
  $('#shopBtn').addEventListener('click', shop);
  $('#cancelRental').addEventListener('click', cancelRental);
  $('#startOver').addEventListener('click', startOver);
  $('#again').addEventListener('click', startOver);
}

async function init() {
  bind();
  try {
    state.config = await api('/api/config');
  } catch {
    state.config = { live: {} };
  }
  const live = state.config.live || {};
  const parts = [!live.ai && 'a rules-based agent stands in for Claude', !live.stripe && 'payments are simulated'].filter(Boolean);
  $('#sampleStrip').hidden = !parts.length;
  $('#sampleStrip').textContent = `Sample mode: ${parts.join(', and ')}.`;
  $('#testNote').textContent = live.stripe ? 'Stripe test mode with a test Visa. No real money moves.' : 'Simulated payments. No real money moves.';
}

init();

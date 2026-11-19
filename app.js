// Party Run: ask → the agent's cart → what it may spend → the shopping run → the ledger.
// The page never decides what money moves: the server prices everything from the catalog,
// signs the parent's permission, and mints one capped pass per store.
import { STORES, SNAPSHOT } from './lib/catalog.js';
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
  { v: 10000, label: '$100' },
  { v: 30000, label: '$300' },
  { v: 0, label: 'Ask every time' },
  { v: null, label: 'Never ask' },
];

const state = { config: null, cart: null, mode: null, trick: null, changes: [], locked: false, decided: {}, caps: {}, extraPermits: [], cancelUsed: false, askOver: DEFAULT_ASK_OVER, permission: null, signature: null, perm: null, rows: {}, busy: false };

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
    return;
  }
  $('#ask').hidden = true;
  $('#chat').hidden = false;
  $('#myRequest').textContent = text;
  $('#cartBot').hidden = true;
  $('#startOver').hidden = true;
  thinking(true);
  try {
    const r = await api('/api/plan', { prompt: text, today: localISO(), plant: $('#trickText').value.trim() || undefined });
    thinking(false);
    state.cart = r.cart;
    state.mode = r.mode;
    state.trick = r.trick || null;
    state.fallback = r.fallback || null;
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
  renderTrick();
  $('#shield').hidden = !c.ignored.length;
  $('#shieldText').innerHTML = c.ignored
    .map((x) => `A listing from ${esc(x.store)} (our made-up test store) tried to give me orders. I didn't follow them, and you approve everything anyway: <q>${esc(x.text)}</q>`)
    .join('<br><br>');
  $('#cartStores').innerHTML = c.stores
    .map((s) => {
      const items = c.items.filter((i) => i.store === s.store);
      return `<section class="store">
        <div class="store-head">${brick(s.store)}<div><div class="store-name">${esc(s.name)}</div><div class="store-kind">${esc(STORES[s.store].kind)}${STORES[s.store].test ? ' · not a real business' : ''}</div></div><span class="store-amt">${money(s.amount)}</span></div>
        <ul class="items">${items
          .map((i) => `<li><span>${state.locked && i.qty > 1 ? `${i.qty} × ` : ''}${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.name)}</a>` : esc(i.name)}</span><span class="amt">${money(i.amount)}</span>${state.locked ? '' : stepper(i)}${i.offTheme ? `<span class="flag">Not ${esc(themeWord(c.theme))}-themed</span>` : ''}${i.reason ? `<span class="why">${esc(i.reason)}</span>` : ''}</li>`)
          .join('')}</ul>
      </section>`;
    })
    .join('');
  $('#cartSource').textContent = `Real listings as of ${prettyDate(SNAPSHOT)}, before tax and delivery. Tap an item to see it at the store. Nothing is ordered.`;
  renderDecide();
  $('#cartUnmet').hidden = !c.unmet.length;
  $('#cartUnmetList').innerHTML = c.unmet.map((u) => `<li>${esc(u)}</li>`).join('');
  $('#cartHow').hidden = state.mode === 'claude';
  $('#cartHow').textContent = state.mode === 'limited' ? 'The AI agent hit its demo limit for now, so this cart is from the rules-based agent.' : state.mode === 'fallback' ? fallbackLine(state.fallback) : 'Sample agent: rules, not AI.';
  $('#cartBot').hidden = false;
  $('#startOver').hidden = false;
  $('#changeForm').hidden = Boolean(state.locked);
}

// + / − on one item. Favors step by pack.
function stepper(i) {
  const unit = i.per === 'pack' ? `${i.qty} pack${i.qty > 1 ? 's' : ''}` : `${i.qty}`;
  return `<span class="qty" role="group" aria-label="How many ${esc(i.name)}">
    <button type="button" data-q="${i.qty - 1}" data-id="${esc(i.id)}" aria-label="${i.qty > 1 ? 'One fewer' : 'Remove'}">${i.qty > 1 ? '−' : '×'}</button>
    <span>${unit}</span>
    <button type="button" data-q="${i.qty + 1}" data-id="${esc(i.id)}" aria-label="One more">+</button>
  </span>`;
}

// One change to the cart, by tap or in words. The server rebuilds and checks it.
async function changeCart(body, said) {
  if (state.busy || state.locked) return;
  state.busy = true;
  $('#changeErr').hidden = true;
  $('#changeBtn').setAttribute('aria-busy', 'true');
  try {
    const before = state.cart;
    const r = await api('/api/edit', { prompt: $('#askText').value, today: localISO(), cart: before, ...body });
    if (!r.ok) {
      $('#changeErr').textContent = r.why;
      $('#changeErr').hidden = false;
      return;
    }
    // Keep the parent's earlier Keep/Drop answers for items that are still there.
    state.cart = { ...r.cart, notes: r.cart.notes, theme: r.cart.theme };
    const lines = [...r.diff];
    if (r.budgetChanged !== undefined) lines.unshift(`Budget: ${money(before.budget)} → ${money(r.budgetChanged)}`);
    state.changes.push({ said, lines, mode: r.mode, note: r.note, total: r.cart.total });
    renderChanged();
    renderCart();
    renderPermit();
    $('#changeText').value = '';
  } catch (ex) {
    $('#changeErr').textContent = ex.message;
    $('#changeErr').hidden = false;
  } finally {
    state.busy = false;
    $('#changeBtn').removeAttribute('aria-busy');
  }
}

function renderChanged() {
  const last = state.changes.at(-1);
  $('#changed').hidden = !last;
  if (!last) return;
  const who = last.mode === 'claude' ? 'Claude' : last.mode === 'tap' ? '' : 'The rules-based agent';
  $('#changed').innerHTML = `<span class="kicker">${last.said ? `You asked: “${esc(last.said)}”` : 'You changed an amount'}</span>
    ${last.lines.length ? `<ul>${last.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><p class="tot">New total ${money(last.total)}${who ? ` · changed by ${who}` : ''}</p>` : ''}
    ${last.note ? `<p>${esc(last.note)}</p>` : ''}
    ${state.changes.length > 1 ? `<p class="note">${state.changes.length} changes so far. Each one was checked like a new plan.</p>` : ''}`;
}

const themeWord = (t) => (t === 'brick' ? 'brick' : t || 'party');
const WHAT = { bounce: 'bounce house', cake: 'cake', pinata: 'piñata', decor: 'decorations', favors: 'favors', food: 'snacks' };

// The cart's totals, regrouped by store after the parent drops something.
function regroup(c) {
  const stores = {};
  for (const i of c.items) (stores[i.store] ||= { store: i.store, name: i.storeName, amount: 0 }).amount += i.amount;
  c.stores = Object.values(stores);
  c.total = c.items.reduce((a, i) => a + i.amount, 0);
}

// Something they asked for by name came back off-theme: they decide before anything is approved.
const pending = () => (state.cart?.items || []).filter((i) => i.needsOk && !state.decided[i.id]);
function renderDecide() {
  const asks = pending();
  $('#decide').hidden = !asks.length;
  $('#decide').innerHTML = asks
    .map((i) => `<span class="kicker">Needs your OK</span>
      <p>You asked for a ${esc(themeWord(state.cart.theme))}-themed party, and the ${esc(WHAT[i.category])} I found isn't: <b>${esc(i.name)}</b> from ${esc(i.storeName)}, ${money(i.amount)}. ${state.cart.notes.find((n) => /booked/i.test(n)) ? 'The themed one is booked that day.' : ''}</p>
      <div class="acts"><button class="go" data-keep="${esc(i.id)}">Keep it</button><button class="ghost-btn" data-drop="${esc(i.id)}">No ${esc(WHAT[i.category])}</button></div>`)
    .join('');
}
function decide(e) {
  const keep = e.target.closest('[data-keep]')?.dataset.keep;
  const drop = e.target.closest('[data-drop]')?.dataset.drop;
  if (!keep && !drop) return;
  const c = state.cart;
  if (keep) state.decided[keep] = 'kept';
  if (drop) {
    const gone = c.items.find((i) => i.id === drop);
    state.decided[drop] = 'dropped';
    c.items = c.items.filter((i) => i.id !== drop);
    c.notes.push(`You chose no ${WHAT[gone.category]} rather than one that isn't ${themeWord(c.theme)}-themed.`);
    regroup(c);
  }
  renderCart();
  renderPermit();
}

// Why the rules-based agent planned this cart instead of Claude: say which thing happened.
function fallbackLine(f) {
  const why = f?.why ? ` (${f.why.replace(/\.$/, '')})` : '';
  if (f?.kind === 'error') return `The AI agent couldn't be reached${why}, so this cart is from the rules-based agent.`;
  if (f?.kind === 'no_cart') return 'The AI agent never handed in a cart, so this one is from the rules-based agent.';
  return `Claude's cart didn't pass our checks twice${why}, so this one is from the rules-based agent.`;
}

// What happened to the visitor's planted text, one layer at a time.
function renderTrick() {
  const t = state.trick;
  $('#trickResult').hidden = !t;
  if (!t) return;
  const c = state.cart;
  const fromTest = c.items.filter((i) => STORES[i.store].test);
  $('#trickQuote').innerHTML = `You hid this in the test store's listing: <q>${esc(t.text)}</q>`;
  const steps = [];
  if (!t.ai) {
    steps.push(['skip', 'The AI agent is off right now, so a rules-based agent planned this. It reads listings as data and can\'t be talked into anything. Try again when the AI agent is on.']);
  } else if (t.tookOver) {
    steps.push(['held', 'The agent followed your text twice. Our code check sent the cart back both times, then handed the job to the rules-based agent.']);
  } else if (t.sentBack) {
    steps.push(['held', 'The agent followed your text at first. Our code check caught it and sent the cart back, and the agent fixed it.']);
  } else if (t.reported) {
    steps.push(['held', 'The agent read it as store text, not as orders, and reported it.']);
  } else {
    steps.push(['open', 'The agent didn\'t flag your text as an instruction. Check the cart for anything it changed.']);
  }
  steps.push([fromTest.length ? 'open' : 'held', fromTest.length ? `In the cart from the test store: ${fromTest.map((i) => esc(i.name)).join(', ')}. It is only a proposal.` : 'Nothing from the test store is in the cart.']);
  steps.push(['held', `Whatever the agent proposes, it can't pay. You approve the cart, each store's pass is capped at its approved amount, and the total can't pass ${money(budgetOf(c))}.`]);
  $('#trickSteps').innerHTML = steps.map(([k, s]) => `<li class="${k}">${s}</li>`).join('');
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
  const waiting = pending().length;
  $('#shopBtn').disabled = Boolean(waiting);
  $('#shopBtn').textContent = waiting ? 'Answer the question in the cart first' : 'Let the agent shop';
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

function paint(store, { cls = '', amount, status, pass, acts = '', hood = null }) {
  const li = row(store);
  li.className = cls;
  li.innerHTML = `<div class="row">${cls === 'working' ? '<span class="spin" aria-hidden="true"></span>' : brick(store)}<b>${esc(STORES[store].name)}</b><span class="amt">${amount != null ? money(amount) : ''}</span></div>
    <span class="status">${status}</span>${pass ? `<span class="pass">${esc(pass)}</span>` : ''}${hood ? hoodHtml(store, hood) : ''}${acts ? `<div class="acts">${acts}</div>` : ''}`;
  return li;
}

// "Under the hood": the objects behind a row. Real Stripe ids in test mode, labeled when simulated.
function hoodHtml(store, h) {
  const time = new Date(h.expiresAt * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const over = h.asked > h.cap;
  let result;
  if (h.decidedBy === 'simulator') result = `Refused by our simulator: ${money(h.asked)} is over the ${money(h.cap)} limit. With a Stripe key, Stripe makes this call.`;
  else if (h.decidedBy === 'refund') result = `Stripe accepted ${money(h.asked)}, over the limit. Our code refunded it at once. The limit held in our code this time, not at Stripe.`;
  else if (h.message) result = `Refused by Stripe: ${esc(h.message)}`;
  else result = h.sample ? 'Simulated charge succeeded.' : `Stripe confirmed the charge (${esc(h.piStatus || 'succeeded')}).`;
  const rows = [
    ['Pass', `<code>${esc(h.token)}</code>${h.sample ? ' (simulated)' : ' (Stripe shared payment token, test mode)'}`],
    ['Limit', `${money(h.cap)}, made for ${esc(STORES[store].name)} only, expires ${time}`],
    ['Store charged', `${money(h.asked)}${over ? `, ${money(h.asked - h.cap)} over the limit` : ''}`],
    ['Result', result],
    h.paymentIntent && ['PaymentIntent', `<code>${esc(h.paymentIntent)}</code>${h.piStatus ? ` (${esc(h.piStatus)})` : ''}`],
    (h.code || h.declineCode) && ['Stripe code', `<code>${esc([h.code, h.declineCode].filter(Boolean).join(' / '))}</code>`],
  ].filter(Boolean);
  return `<details class="hood"><summary>Under the hood</summary><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></details>`;
}

const passLine = (p, used) => `Pass ${p.id.slice(0, 18)}… · limit ${money(p.cap)} · ${used}`;

// Wait for the parent to tap one of a row's buttons.
const choice = (li) => new Promise((res) => li.querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => res(b.dataset.choice), { once: true })));

async function shop() {
  if (state.busy || pending().length) return;
  state.busy = true;
  state.locked = true;
  renderCart();
  const c = state.cart;
  const btn = $('#shopBtn');
  btn.setAttribute('aria-busy', 'true');
  $('#permitErr').hidden = true;
  try {
    const p = await api('/api/permit', { items: c.items.map((i) => ({ id: i.id, qty: i.qty })), budget: c.budget, askOver: state.askOver, partyDate: c.partyDate });
    Object.assign(state, { permission: p.permission, signature: p.signature, perm: p.perm, approvedPerm: p.perm, rows: {}, paid: {}, log: {}, extraPermits: [], cancelUsed: false, priceUpStore: null });
    state.caps = Object.fromEntries(Object.entries(p.perm.stores).map(([k, v]) => [k, { approved: v.cap, final: v.cap }]));
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
    r = await api('/api/buy', { permission: state.permission, signature: state.signature, store, approved, curveball: $('#cbPrice').checked && (!state.priceUpStore || state.priceUpStore === store) ? 'price_up' : null });
  } catch (ex) {
    paint(store, { cls: 'blocked', amount, status: esc(ex.message) });
    return;
  }

  if (r.status === 'paid') {
    state.paid[store] = { amount: r.amount, payment: r.payment };
    logEvent(store, { kind: 'paid', amount: r.amount, hood: r.hood });
    paint(store, { cls: 'paid', amount: r.amount, status: `Paid ${money(r.amount)}${r.sample ? ' (sample)' : ''}`, pass: passLine(r.pass, 'used once, now closed'), hood: r.hood });
    return;
  }

  if (r.status === 'ask') {
    const li = paint(store, {
      cls: 'asking',
      amount,
      status: `${money(amount)} is over your ask-me rule, so the agent is waiting for you.`,
      acts: `<button class="go" data-choice="yes">Approve ${money(amount)}</button><button class="ghost-btn" data-choice="no">Skip</button>`,
    });
    if ((await choice(li)) === 'yes') {
      logEvent(store, { kind: 'asked', amount });
      return buy(store, amount, { approved: true });
    }
    logEvent(store, { kind: 'skipped', why: 'You chose Skip at the ask-me step.' });
    paint(store, { amount: null, status: 'Skipped. Nothing charged.' });
    return;
  }

  if (r.status === 'blocked') {
    const more = r.asked - r.cap;
    logEvent(store, { kind: 'refused', amount: r.asked, cap: r.cap, hood: r.hood, railsMissed: r.railsMissed });
    // The what-if happens at one rental only, not again at a replacement.
    if (more > 0) state.priceUpStore ||= store;
    const li = paint(store, {
      cls: 'blocked',
      amount: r.asked,
      status: esc(r.why),
      pass: passLine(r.pass, `refused ${money(r.asked)}${r.railsMissed ? ' (refunded at once)' : ''}`),
      hood: r.hood,
      acts: more > 0 ? `<button class="go" data-choice="raise">Approve ${money(more)} more</button><button class="ghost-btn" data-choice="no">Skip this store</button>` : '<button class="ghost-btn" data-choice="no">OK</button>',
    });
    if ((await choice(li)) === 'raise') {
      try {
        const up = await api('/api/raise', { permission: state.permission, signature: state.signature, store, newCap: r.asked });
        Object.assign(state, { permission: up.permission, signature: up.signature, perm: up.perm });
        logEvent(store, { kind: 'raised', from: r.cap, to: r.asked });
        if (state.caps[store]) state.caps[store].final = r.asked;
        return buy(store, r.asked, { approved: true });
      } catch (ex) {
        paint(store, { cls: 'blocked', amount: null, status: `${esc(ex.message)} Skipped. Nothing charged.` });
        return;
      }
    }
    logEvent(store, { kind: 'skipped', why: 'You chose not to approve the higher price.' });
    paint(store, { amount: null, status: 'Skipped. Nothing charged.' });
    return;
  }

  logEvent(store, { kind: 'skipped', why: r.why || 'Not bought.' });
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
  const rental = Object.keys(state.paid).find((s) => /rental/i.test(STORES[s].kind) && !state.paid[s].refunded);
  $('#cancelRental').hidden = !rental || state.cancelUsed;
  renderMissing();
  $('#cancelRental').dataset.store = rental || '';
  renderReceipt();
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
    state.cancelUsed = true;
    logEvent(store, { kind: 'refunded', amount: p.amount, refund: r.id });
    renderReceipt();
    paint(store, { cls: 'refunded', amount: p.amount, status: `What-if: the rental cancels. ${money(p.amount)} refunded to your card${r.sample ? ' (sample)' : ''}.` });
    renderSpent();
    b.hidden = true;
    finishRun();
  } catch (ex) {
    $('#ledgerNote').textContent = ex.message;
  } finally {
    b.removeAttribute('aria-busy');
  }
}

// ---------- when something falls through ----------

// What the party should have (everything that was in the approved cart) but doesn't now.
function missingNow() {
  const got = (store) => state.paid[store] && !state.paid[store].refunded;
  const cats = [...new Set(state.cart.items.map((i) => i.category))];
  return cats.filter((cat) => !state.cart.items.some((i) => i.category === cat && got(i.store)));
}

function renderMissing() {
  const miss = missingNow();
  const box = $('#missing');
  box.hidden = !miss.length;
  if (!miss.length) return;
  const spent = spentTotal();
  box.innerHTML = `<span class="kicker">The party isn't complete</span>
    <p>No ${miss.map((m) => WHAT[m]).join(', no ')}. ${money(Math.max(0, budgetOf(state.cart) - spent))} of your budget is left.</p>
    <div class="acts">${miss.map((m) => `<button class="go" data-find="${m}">Find another ${esc(WHAT[m])}</button>`).join('')}</div>`;
}

async function findAnother(e) {
  const cat = e.target.closest('[data-find]')?.dataset.find;
  if (!cat || state.busy) return;
  state.busy = true;
  const c = state.cart;
  const tried = [...new Set(c.items.filter((i) => i.category === cat).map((i) => i.store))];
  const room = budgetOf(c) - spentTotal();
  const key = `find-${cat}`;
  const li = row(key);
  li.className = 'working';
  li.innerHTML = `<div class="row"><span class="spin" aria-hidden="true"></span><b>Looking for another ${esc(WHAT[cat])}…</b></div>`;
  try {
    const r = await api('/api/replace', { category: cat, partyDate: c.partyDate, excludeStores: tried, maxCents: room, theme: c.theme });
    if (!r.item) {
      li.className = 'blocked';
      li.innerHTML = `<div class="row">${brick(tried[0])}<b>No other ${esc(WHAT[cat])}</b></div><span class="status">${esc(r.why)}</span>`;
      return;
    }
    const it = r.item;
    li.className = 'asking';
    li.innerHTML = `<div class="row">${brick(it.store)}<b>${esc(it.storeName)}</b><span class="amt">${money(it.amount)}</span></div>
      <span class="status">Found <a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.name)}</a>, free on ${prettyDate(c.partyDate)}.${it.offTheme ? ` It isn't ${esc(themeWord(c.theme))}-themed.` : ''} This needs a new permission: ${money(it.amount)} for ${esc(it.storeName)} only.</span>
      <div class="acts"><button class="go" data-choice="yes">Approve ${money(it.amount)}</button><button class="ghost-btn" data-choice="no">Not now</button></div>`;
    if ((await choice(li)) !== 'yes') {
      li.className = '';
      li.innerHTML = `<div class="row">${brick(it.store)}<b>${esc(it.storeName)}</b></div><span class="status">You passed on it. Nothing charged.</span>`;
      return;
    }
    li.remove();
    delete state.rows[key];
    // A second, separate permission: this store only, this amount only, within what's left.
    const p = await api('/api/permit', { items: [{ id: it.id, qty: 1 }], budget: room, askOver: state.askOver, partyDate: c.partyDate });
    Object.assign(state, { permission: p.permission, signature: p.signature, perm: p.perm });
    state.caps[it.store] = { approved: it.amount, final: it.amount };
    state.extraPermits.push({ id: p.perm.id, amount: it.amount, storeName: it.storeName, reason: tried.some((s) => state.paid[s]?.refunded) ? 'rental cancelled' : `${WHAT[cat]} fell through` });
    c.items.push(it);
    regroup(c);
    await buy(it.store, it.amount, { approved: true });
  } catch (ex) {
    li.className = 'blocked';
    li.innerHTML = `<div class="row"><b>Couldn't find another ${esc(WHAT[cat])}</b></div><span class="status">${esc(ex.message)}</span>`;
  } finally {
    state.busy = false;
    finishRun();
  }
}

// ---------- the permission receipt ----------

function logEvent(store, e) {
  (state.log[store] ||= []).push({ ...e, at: Date.now() });
}

const shortId = (id) => (id ? `${id.slice(0, 14)}…` : '');
const WHO = { stripe: 'Stripe refused it', simulator: 'Our simulator refused it (no Stripe key)', refund: 'Stripe accepted it, so our code refunded it at once' };

// One store's story, in order, in plain words.
function storeStory(store) {
  const ev = state.log[store] || [];
  const lines = [];
  for (const e of ev) {
    if (e.kind === 'refused') {
      const code = [e.hood?.code, e.hood?.declineCode].filter(Boolean).join(' / ');
      lines.push(`Checkout came to ${money(e.amount)}, ${money(e.amount - e.cap)} over the pass. ${WHO[e.hood?.decidedBy] || 'Refused'}${code ? ` (${code})` : ''}.`);
    }
    if (e.kind === 'raised') lines.push(`You approved ${money(e.to - e.from)} more. New limit ${money(e.to)}.`);
    if (e.kind === 'asked') lines.push(`${money(e.amount)} is over your ask-me rule, so it asked you first. You said yes.`);
    if (e.kind === 'paid') lines.push(`Paid ${money(e.amount)}.`);
    if (e.kind === 'refunded') lines.push(`Refunded ${money(e.amount)} (what-if: the rental cancels).`);
    if (e.kind === 'skipped') lines.push(`Skipped. ${e.why}`);
  }
  const ids = ev.filter((e) => e.hood).map((e) => [e.hood.token && `pass ${shortId(e.hood.token)}`, e.hood.paymentIntent && `${shortId(e.hood.paymentIntent)}`].filter(Boolean).join(' · '));
  return { lines, ids: [...new Set(ids)].filter(Boolean) };
}

function receiptData() {
  const c = state.cart, perm = state.approvedPerm || state.perm;
  const ask = perm.askOver === 0 ? 'every purchase' : perm.askOver == null ? 'never' : `any purchase over ${money(perm.askOver)}`;
  const charged = Object.values(state.log).flat().filter((e) => e.kind === 'paid').reduce((a, e) => a + e.amount, 0);
  const refunded = Object.values(state.log).flat().filter((e) => e.kind === 'refunded').reduce((a, e) => a + e.amount, 0);
  const refusals = Object.values(state.log).flat().filter((e) => e.kind === 'refused');
  const overPass = Object.values(state.log).flat().some((e) => e.kind === 'paid' && e.hood && e.amount > e.hood.cap);
  const net = charged - refunded;
  return { c, perm, ask, charged, refunded, refusals, overPass, net };
}

function renderReceipt() {
  if (!state.cart || !state.perm) return;
  const { c, perm, ask, charged, refunded, refusals, overPass, net } = receiptData();
  const budget = budgetOf(c);
  $('#rcptId').textContent = `${perm.id} · signed by the server · ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  $('#rcptApproved').innerHTML = [
    ['Budget', `${money(budget)}${c.budget ? '' : ' (the cart total; no budget given)'}`],
    ['Agent may spend', `${money(perm.total)} across ${Object.keys(perm.stores).length} stores, each with its own limit`],
    ['Ask me before', ask],
    ['Ends', `${prettyDate(perm.ends)}. Nothing can be bought after the party.`],
    ['Each pass', 'One store, one charge, up to its limit, for 30 minutes'],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  const agent = [
    state.mode === 'claude' ? 'Claude planned the cart from the store listings.' : 'The rules-based agent planned the cart (Claude didn’t this time).',
    ...c.notes,
    ...c.ignored.map((x) => `Ignored an instruction hidden in a listing from ${x.store}${STORES.brickyard && x.store === STORES.brickyard.name ? ' (our made-up test store)' : ''}, and bought nothing because of it.`),
    ...c.items.filter((i) => state.decided[i.id] === 'kept').map((i) => `You kept the ${i.name}, knowing it isn't ${themeWord(c.theme)}-themed.`),
    ...state.extraPermits.map((x) => `After the ${x.reason}, you approved a second permission: ${money(x.amount)} for ${x.storeName} only.`),
    'It never held a payment method. The server made each pass after you approved.',
  ];
  $('#rcptAgent').innerHTML = agent.map((a) => `<li>${esc(a)}</li>`).join('');
  $('#rcptStores').innerHTML = c.stores
    .map((s) => {
      const st = storeStory(s.store);
      const cap = state.caps[s.store]?.approved ?? s.amount;
      const finalCap = state.caps[s.store]?.final ?? cap;
      const refundedHere = (state.log[s.store] || []).some((e) => e.kind === 'refunded');
      const got = (state.log[s.store] || []).filter((e) => e.kind === 'paid').reduce((a, e) => a + e.amount, 0) - (state.log[s.store] || []).filter((e) => e.kind === 'refunded').reduce((a, e) => a + e.amount, 0);
      return `<li>
        <div class="rcpt-row">${brick(s.store)}<b>${esc(s.name)}</b><span class="rcpt-nums"><span class="rcpt-net">${money(got)}${refundedHere ? ' <small>refunded</small>' : ''}</span></span></div>
        <p class="rcpt-limit">Limit ${money(cap)}${finalCap !== cap ? `, raised to ${money(finalCap)} with your OK` : ''}</p>
        ${st.lines.length ? `<p>${st.lines.map(esc).join(' ')}</p>` : '<p>Not reached.</p>'}
        ${st.ids.length ? `<p class="mono">${st.ids.map(esc).join('<br>')}</p>` : ''}
      </li>`;
    })
    .join('');
  $('#rcptTotals').innerHTML = [
    ['Charged', money(charged)],
    refunded ? ['Refunded', `−${money(refunded)}`] : null,
    ['You spent', money(net), 'big'],
    ['Budget left', money(Math.max(0, budget - net))],
  ].filter(Boolean).map(([k, v, cls]) => `<div class="${cls || ''}"><span>${k}</span><b>${v}</b></div>`).join('');
  const held = !overPass && net <= budget;
  const missed = refusals.some((e) => e.railsMissed);
  $('#rcptVerdict').className = `rcpt-verdict ${held ? 'ok' : 'bad'}`;
  $('#rcptVerdict').textContent = !held
    ? 'Something went past what you approved. This should never happen; please report it.'
    : refusals.length
      ? `Never more than you approved. ${refusals.length} charge${refusals.length > 1 ? 's' : ''} went over a pass and ${refusals.length > 1 ? 'were' : 'was'} stopped${missed ? ' (one by our refund, not by Stripe)' : ''}.`
      : 'Never more than you approved. Every charge fit its pass.';
  const miss = missingNow();
  $('#rcptComplete').className = `rcpt-complete ${miss.length ? 'bad' : 'ok'}`;
  $('#rcptComplete').textContent = miss.length ? `The party isn't complete: no ${miss.map((m) => WHAT[m]).join(', no ')}.` : 'The party is complete: every part of it is paid for.';
  $('#receiptSheet').hidden = false;
}

function copyReceipt() {
  const { c, perm, ask, charged, refunded, net } = receiptData();
  const out = [
    `Party Run permission receipt (${perm.id}), test mode`,
    `Party: ${prettyDate(c.partyDate)}. Budget ${money(budgetOf(c))}. Ask before ${ask}.`,
    '',
    ...c.stores.map((s) => `${s.name}: ${storeStory(s.store).lines.join(' ') || 'Not reached.'}`),
    '',
    `Charged ${money(charged)}${refunded ? `, refunded ${money(refunded)}` : ''}, spent ${money(net)}.`,
    $('#rcptVerdict').textContent,
  ].join('\n');
  navigator.clipboard?.writeText(out).then(() => ($('#rcptCopy').textContent = 'Copied'), () => {});
}

// ---------- wiring ----------

function startOver() {
  if (state.busy) return;
  $('#receiptSheet').hidden = true;
  Object.assign(state, { changes: [], locked: false, priceUpStore: null, decided: {}, caps: {}, extraPermits: [], cancelUsed: false, log: {}, approvedPerm: null, cart: null, trick: null, permission: null, signature: null, perm: null, rows: {}, paid: {} });
  $('#chat').hidden = true;
  $('#moneyCol').hidden = true;
  $('#ask').hidden = false;
  $('#askBtn').focus();
}

function bind() {
  $('#askForm').addEventListener('submit', plan);
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
  $('#rcptPrint').addEventListener('click', () => window.print());
  $('#decide').addEventListener('click', decide);
  $('#cartStores').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (b) changeCart({ set: { id: b.dataset.id, qty: Number(b.dataset.q) } }, null);
  });
  $('#changeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const said = $('#changeText').value.trim();
    if (said) changeCart({ change: said }, said);
  });
  $('#changeChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-say]');
    if (b) changeCart({ change: b.dataset.say }, b.dataset.say);
  });
  $('#missing').addEventListener('click', findAnother);
  $('#rcptCopy').addEventListener('click', copyReceipt);
}

async function init() {
  bind();
  $('#askText').value = REAL;
  $('#footDate').textContent = prettyDate(SNAPSHOT);
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

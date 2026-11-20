// Cakewalk: ask → the agent's cart → what it may spend → the shopping run → the ledger.
// The page never decides what money moves: the server prices everything from the catalog,
// signs the parent's permission, and mints one capped pass per store.
import { STORES, SNAPSHOT, byId } from './lib/catalog.js';
import { DEFAULT_ASK_OVER, totals, DEMO_ZIP } from './lib/rules.js';
import { optionsFor, qtyFor } from './lib/options.js';
import { offTheme, FULFILL_WORDS } from './lib/catalog.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (c) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const prettyDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const localISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Our real party: a building-brick 5th birthday in the backyard.
const REAL = "Lego-themed 5th birthday, a backyard party in 90210 on Dec 5, 10am to noon, for 6-10 kids ages 2 to 5. We'd love a bounce house and a piñata. Under $600.";

const ASK_CHOICES = [
  { v: 5000, label: '$50' },
  { v: 10000, label: '$100' },
  { v: 30000, label: '$300' },
  { v: 0, label: 'Ask every time' },
  { v: null, label: 'Never ask' },
];

const state = { opts: null, config: null, cart: null, mode: null, trick: null, declined: new Set(), noneLeft: {}, changes: [], locked: false, decided: {}, caps: {}, extraPermits: [], cancelUsed: false, askOver: DEFAULT_ASK_OVER, permission: null, signature: null, perm: null, rows: {}, busy: false };

async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Something went wrong. Try again?');
  return data;
}

// A generic toy brick in the store's color: the badge for each store.
// ---------- the agent's face ----------
// One face, a few moods: thinking while it works, happy when a store is paid, an eyebrow
// when it hands something to you, a wink when it ignores a hidden instruction.
const INK = '#161412';
const FACES = {
  idle: `<circle cx="13" cy="15" r="2" fill="${INK}"/><circle cx="23" cy="15" r="2" fill="${INK}"/><path d="M11 21 q7 7 14 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  working: `<circle cx="15.5" cy="12" r="2.2" fill="${INK}"/><circle cx="25.5" cy="12" r="2.2" fill="${INK}"/><path d="M12 23 q6 3 12 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M20.5 23.9 q2.5 4 4.5 -0.6" fill="#FF7A7A" stroke="${INK}" stroke-width="1.6"/>`,
  happy: `<path d="M9.5 16 q3.5 -4.5 7 0 M19.5 16 q3.5 -4.5 7 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M10 20 q8 11 16 0 z" fill="${INK}"/>`,
  brow: `<path d="M9 10.5 h7 M20 9.5 l7 -2.5" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><circle cx="13" cy="15" r="2" fill="${INK}"/><circle cx="23" cy="15" r="2" fill="${INK}"/><path d="M12 23 q6 2.5 12 -1" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  // While it thinks: one face per line, so it visibly reacts to what it's doing.
  read: `<circle cx="13" cy="17.5" r="2.2" fill="${INK}"/><circle cx="23" cy="17.5" r="2.2" fill="${INK}"/><path d="M14 25 h8" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  right: `<circle cx="16.5" cy="14" r="2.2" fill="${INK}"/><circle cx="26.5" cy="14" r="2.2" fill="${INK}"/><path d="M13 23 q6 4 12 -1" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  yum: `<path d="M9.5 15.5 q3.5 -4.5 7 0 M19.5 15.5 q3.5 -4.5 7 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M11 21 q7 7 14 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M19.5 24.6 q2.5 4.5 5 0.2" fill="#FF7A7A" stroke="${INK}" stroke-width="1.6"/>`,
  squint: `<path d="M10 15.5 h5.5 M20.5 15.5 h5.5" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M9.5 10.5 q3.5 -3 7 0 M19.5 9 q3.5 -3 7 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><path d="M13 24 q2.5 -2 5 0 q2.5 2 5 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`,
  up: `<circle cx="14" cy="11" r="2.2" fill="${INK}"/><circle cx="24" cy="11" r="2.2" fill="${INK}"/><circle cx="21" cy="24" r="2.4" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
  wink: `<circle cx="13" cy="15" r="2" fill="${INK}"/><path d="M20 15.5 q3 2.5 6 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M11 21 q7 7 14 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
};
function mood(el, m) {
  if (!el || el.dataset.mood === m) return;
  el.dataset.mood = m;
  el.innerHTML = `<svg viewBox="0 0 36 36">${FACES[m] || FACES.idle}</svg>`;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

// ---------- the candles ----------
// One candle per store (this party has five). Paid lights it; refused, skipped or
// cancelled leaves it out. A replacement relights the candle it stands in for.
function cakeSvg(n) {
  const W = 168, cx = (i) => 34 + (i * (W - 68)) / Math.max(1, n - 1);
  const candles = Array.from({ length: n }, (_, i) => `<g class="candle" data-slot="${i}" transform="translate(${n === 1 ? W / 2 : cx(i)},0)">
      <rect x="-4" y="22" width="8" height="24" rx="2" fill="var(--c, #E4E0D8)" stroke="${INK}" stroke-width="1.8"/>
      <path d="M0 22 v-4" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
      <path class="flame" d="M0 3 C5 9 5 14 0 17 C-5 14 -5 9 0 3 z" fill="#FFD23F" stroke="#E8590C" stroke-width="1.4"/>
      <path class="smoke" d="M0 14 c3 -3 -3 -6 0 -9 c3 -3 -3 -6 0 -9" fill="none" stroke="#9C958C" stroke-width="1.6" stroke-linecap="round"/>
    </g>`).join('');
  const studs = [0, 1, 2, 3, 4, 5].map((k) => `<rect x="${22 + k * 21}" y="41" width="14" height="7" rx="2" fill="#FFF1C9" stroke="${INK}" stroke-width="1.8"/>`).join('');
  return `<svg viewBox="0 0 ${W} 104">${candles}${studs}
    <rect x="14" y="47" width="${W - 28}" height="44" rx="8" fill="#FFF1C9" stroke="${INK}" stroke-width="2.2"/>
    <path d="M15 63 h${W - 30}" stroke="#FF8A80" stroke-width="5"/>
    <rect x="4" y="91" width="${W - 8}" height="9" rx="4.5" fill="#fff" stroke="${INK}" stroke-width="2"/></svg>`;
}
function renderCake(stores) {
  state.slots = stores.map((s) => ({ store: s.store, state: 'unlit' }));
  $('#cake').innerHTML = cakeSvg(stores.length);
  stores.forEach((s, i) => $(`#cake [data-slot="${i}"]`).style.setProperty('--c', STORES[s.store].color));
  cakeNote();
}
function candle(store, st) {
  if (!state.slots) return;
  let i = state.slots.findIndex((x) => x.store === store);
  if (i < 0 && st === 'lit') i = state.slots.findIndex((x) => x.state === 'out');
  if (i < 0) return;
  state.slots[i] = { store, state: st };
  const g = $(`#cake [data-slot="${i}"]`);
  if (!g) return;
  g.setAttribute('class', `candle ${st}`);
  g.style.setProperty('--c', STORES[store].color);
  cakeNote();
}
function cakeNote() {
  const lit = state.slots.filter((x) => x.state === 'lit').length;
  $('#cakeNote').textContent = `${lit} of ${state.slots.length} candles lit`;
}

// ---------- party voice (never in the numbers) ----------
function partyLine(store) {
  const items = state.cart.items.filter((i) => i.store === store);
  const cats = new Set(items.map((i) => i.category));
  const out = [];
  if (cats.has('bounce')) out.push(`Bounce house: booked for ${prettyDate(state.cart.partyDate).replace(/^\w+, /, '')}.`);
  if (cats.has('cake')) out.push(`Cake: done. Serves ${byId[items.find((i) => i.category === 'cake').id].serves || 'the crowd'}.`);
  if (cats.has('pinata')) out.push(state.cart.little && byId[items.find((i) => i.category === 'pinata').id].pull ? 'Piñata: secured. Pull-string, so no bats near the toddlers.' : 'Piñata: secured.');
  if (cats.has('favors')) out.push(`Favors: ${state.cart.kids} kids covered.`);
  if (cats.has('food')) out.push('Snacks: sorted.');
  if (cats.has('decor')) out.push('Plates and cups: set.');
  return out.join(' ');
}
function bookedLine() {
  const got = (s) => state.paid[s] && !state.paid[s].refunded;
  const cats = new Set(state.cart.items.filter((i) => got(i.store)).map((i) => i.category));
  const names = [['bounce', 'the bounce house'], ['cake', 'the cake'], ['pinata', 'the piñata'], ['favors', `${state.cart.kids} favors`], ['food', 'snacks'], ['decor', 'the plates']].filter(([k]) => cats.has(k)).map(([, n]) => n);
  if (!names.length) return '';
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return `${list[0].toUpperCase()}${list.slice(1)} ${names.length > 1 ? 'are' : 'is'} booked. `;
}

const brick = (store) => {
  const c = STORES[store]?.color || '#DDD';
  return `<svg class="brick" viewBox="0 0 26 20" aria-hidden="true"><rect x="1" y="7" width="24" height="12" rx="2" fill="${c}" stroke="#161412" stroke-width="1.6"/><rect x="4.5" y="2.5" width="6" height="4.5" rx="1.2" fill="${c}" stroke="#161412" stroke-width="1.4"/><rect x="15.5" y="2.5" width="6" height="4.5" rx="1.2" fill="${c}" stroke="#161412" stroke-width="1.4"/></svg>`;
};

// ---------- asking ----------

const THINKING = ['Reading your message…', 'Checking who has bounce houses…', 'Looking at cakes…', 'Finding favors for little hands…', 'Reading the fine print…', 'Adding it all up…'];
const THINK_FACES = ['read', 'right', 'yum', 'read', 'squint', 'up'];
let thinkTimer = null;
function thinking(on) {
  clearInterval(thinkTimer);
  $('#thinking').hidden = !on;
  if (!on) return;
  let n = 0;
  const show = () => {
    $('#thinkingLine').textContent = THINKING[n];
    mood($('#thinkFace'), THINK_FACES[n]);
  };
  show();
  thinkTimer = setInterval(() => { n = (n + 1) % THINKING.length; show(); }, 1600);
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
  mood($('#cartFace'), c.ignored.length ? 'wink' : 'happy');
  // The agent's reasoning is there when she wants it, not in her way.
  $('#moreNotes').hidden = !c.notes.length;
  $('#cartNotesMore').innerHTML = c.notes.map((n) => `<li>${esc(n)}</li>`).join('');
  renderTrick();
  $('#shield').hidden = !c.ignored.length;
  $('#shieldLine').textContent = c.ignored.length ? `I ignored a hidden instruction in ${c.ignored[0].store}'s listing (our made-up test store).` : '';
  $('#shieldText').innerHTML = c.ignored
    .map((x) => `I didn't follow it, and you approve everything anyway: <q>${esc(x.text)}</q>`)
    .join('<br><br>');
  renderGroups();
  $('#cartSource').textContent = `Real listings as of ${prettyDate(SNAPSHOT)}. Prices as listed; delivery and tax are estimates. Nothing is ordered.`;
  renderAskedMissing();
  $('#cartUnmet').hidden = !c.unmet.length;
  $('#cartUnmetList').innerHTML = c.unmet.map((u) => `<li>${esc(u)}</li>`).join('');
  $('#cartHow').hidden = state.mode === 'claude';
  $('#cartHow').textContent = state.mode === 'limited' ? 'The AI agent hit its demo limit for now, so this cart is from the rules-based agent.' : state.mode === 'fallback' ? fallbackLine(state.fallback) : 'Sample agent: rules, not AI.';
  $('#cartBot').hidden = false;
  if (state.locked) $('#changeForm').hidden = true;
  renderSteps();
}

const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// Two steps: look over the party (and answer anything flagged), then the go-ahead.
function renderSteps() {
  const ask = pending().length + (state.locked ? 0 : askedMissing().length);
  $('#step2Lbl').textContent = `1 · Here's the party`;
  $('#step3Lbl').textContent = `Step 2`;
  $('#permitSheet').classList.toggle('later', Boolean(ask));
  $('#permitSheet').inert = Boolean(ask);
  $('#waitNote').hidden = !ask;
}

// Amounts only where more of something makes sense: favors, food and drinks. One cake, one bounce house.
const countable = (i) => i.per === 'pack' || i.category === 'food' || Boolean(byId[i.id]?.countable);

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
    // Anything the parent took out on purpose isn't "missing" later.
    for (const cat of new Set(before.items.map((i) => i.category))) if (!r.cart.items.some((i) => i.category === cat)) state.declined.add(cat);
    state.cart = { ...r.cart, notes: r.cart.notes, theme: r.cart.theme };
    if (body.swap) { state.decided[body.swap.to] = 'kept'; state.opts = null; }
    const lines = body.swap
      ? [`Swapped in ${byId[body.swap.to].name} from ${STORES[byId[body.swap.to].store].name} (${signed(r.cart.total - before.total)})`]
      : [...r.diff];
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
  $('#changed').innerHTML = `<span class="kicker">${last.said ? `You asked: “${esc(last.said)}”` : 'Your change'}</span>
    ${last.lines.length ? `<ul>${last.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><p class="tot">New total ${money(last.total)}${who ? ` · changed by ${who}` : ''}</p>` : ''}
    ${last.note ? `<p>${esc(last.note)}</p>` : ''}
    ${state.changes.length > 1 ? `<p class="note">${state.changes.length} changes so far. Each one was checked like a new plan.</p>` : ''}`;
}

const themeWord = (t) => (t === 'brick' ? 'brick' : t || 'party');
const WHAT = { bounce: 'bounce house', cake: 'cake', pinata: 'piñata', decor: 'decorations', favors: 'favors', food: 'snacks' };

// The cart's totals, regrouped by store after the parent drops something.
function regroup(c) {
  const t = totals(c.items.map((i) => ({ id: i.id, qty: i.qty })));
  c.stores = t.stores.map(({ lines: _, ...x }) => x);
  Object.assign(c, { total: t.total, itemsTotal: t.items, delivery: t.delivery, tax: t.tax });
}

// Something they asked for by name isn't in the cart at all: say so, and offer to add it.
const askedMissing = () => (state.cart?.asked || []).filter((cat) => WHAT[cat] && !state.cart.items.some((i) => i.category === cat) && !state.declined.has(cat));
function renderAskedMissing() {
  const gone = state.locked ? [] : askedMissing();
  $('#askedMissing').hidden = !gone.length;
  $('#askedMissing').innerHTML = gone
    .map((cat) => `<span class="kicker">Missing from the cart</span>
      <p>You asked for a ${esc(WHAT[cat])}, but it isn't in the cart.</p>
      <div class="acts"><button class="go" data-add="${cat}">Add a ${esc(WHAT[cat])}</button><button class="ghost-btn" data-nocat="${cat}">Skip it</button></div>`)
    .join('');
}

// Something they asked for by name came back off-theme: it's flagged on its own row, and the
// go-ahead waits until she keeps it, swaps it or removes it.
const pending = () => (state.cart?.items || []).filter((i) => i.needsOk && !state.decided[i.id]);

// The party by what it is, the way a parent thinks about it. Stores are a label on each item.
const GROUPS = [
  { title: 'Fun', cats: ['bounce', 'pinata'] },
  { title: 'Food', cats: ['cake', 'food'] },
  { title: 'Plates and napkins', cats: ['decor'] },
  { title: 'Favors', cats: ['favors'] },
];
const link = (i) => (i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.name)}</a>` : esc(i.name));
const signed = (n) => (n === 0 ? 'same price' : `${n > 0 ? '+' : '−'}${money(Math.abs(n))}`);

function optionsOf(i) {
  const c = state.cart;
  return optionsFor({ category: i.category, date: c.partyDate, today: localISO(), theme: c.theme, little: c.little, exclude: c.items.map((x) => x.id) })
    .map((p) => ({ ...p, qty: qtyFor(p, { kids: c.kids, was: i.qty }) }));
}

function renderGroups() {
  const c = state.cart;
  const theme = themeWord(c.theme);
  $('#cartGroups').innerHTML = GROUPS.map((g) => {
    const items = c.items.filter((i) => g.cats.includes(i.category));
    if (!items.length) return '';
    const sub = items.reduce((a, i) => a + i.amount, 0);
    return `<section class="grp"><header class="grp-head"><h3>${g.title}</h3><span>${money(sub)}</span></header>
      <ul class="grp-items">${items.map((i) => itemRow(i, theme)).join('')}</ul></section>`;
  }).join('');
}

function itemRow(i, theme) {
  const c = state.cart;
  const live = !state.locked;
  const opts = live ? optionsOf(i) : [];
  const open = state.opts === i.id;
  const asking = live && i.needsOk && !state.decided[i.id];
  const booked = c.notes.some((n) => /booked/i.test(n)) && i.category === 'bounce';
  const flag = asking
    ? `<div class="flag" role="group" aria-label="Needs your OK">
        <p><b>Not ${esc(theme)}-themed.</b> ${booked ? `The ${esc(theme)}-themed one is booked Dec 5, so I picked this instead.` : `You asked for a ${esc(theme)}-themed party.`}</p>
        <div class="acts"><button class="go sm" data-keep="${esc(i.id)}">Keep it</button>${opts.length ? `<button class="ghost-btn sm" data-opts="${esc(i.id)}" aria-expanded="${open}">See ${opts.length} other option${opts.length > 1 ? 's' : ''}</button>` : ''}<button class="link-btn sm" data-drop="${esc(i.id)}">Remove</button></div>
      </div>`
    : i.offTheme && c.theme ? `<span class="tag">Not ${esc(theme)}-themed${state.decided[i.id] === 'kept' ? ' · you OK’d it' : ''}</span>` : '';
  const more = !live || asking ? ''
    : opts.length ? `<button class="link-btn more" data-opts="${esc(i.id)}" aria-expanded="${open}">${open ? 'Hide' : `${opts.length} other option${opts.length > 1 ? 's' : ''}`}</button>`
    : c.little && (i.category === 'favors' || i.category === 'pinata') ? `<span class="none">The only one here that's safe for 2-year-olds.</span>` : '';
  const panel = !open ? '' : `<div class="opts">
      <ul>${opts.map((p) => `<li>
        <div class="o-main"><div class="o-name">${link(p)}</div><div class="it-store">${brick(p.store)}${esc(STORES[p.store].name)}${!offTheme(p, c.theme) && c.theme ? ` · <span class="ok">${esc(theme)}-themed</span>` : ''}</div></div>
        <div class="o-amt">${money(p.price * p.qty)}<span class="diff">${signed(p.price * p.qty - i.amount)}</span></div>
        <button class="ghost-btn sm" data-swap="${esc(p.id)}" data-from="${esc(i.id)}">Swap</button></li>`).join('')}</ul>
      ${i.reason ? `<p class="note">Why I picked the one you have: ${esc(i.reason)}</p>` : ''}
    </div>`;
  const n = (state.locked || !countable(i)) && i.qty > 1 ? `${i.qty} × ` : '';
  return `<li class="it${asking ? ' asking' : ''}" data-id="${esc(i.id)}">
      <div class="it-main"><div class="it-name">${n}${link(i)}</div><div class="it-store">${brick(i.store)}${esc(i.storeName)} · ${esc(FULFILL_WORDS[STORES[i.store].fulfill.how])}${STORES[i.store].test ? ' · not a real business' : ''}</div>${asking ? '' : flag}</div>
      <div class="it-amt">${money(i.amount)}${live && countable(i) ? stepper(i) : ''}</div>
      ${(asking && flag) || more || panel ? `<div class="it-more">${asking ? flag : ''}${more}${panel}</div>` : ''}
    </li>`;
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
    state.declined.add(gone.category);
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
  $('#permitTotal').textContent = money(c.total);
  $('#permitOf').textContent = c.budget ? `of your ${money(c.budget)} budget` : 'No budget given, so the cart is the limit.';
  $('#permitBreak').innerHTML = `Items ${money(c.itemsTotal)} · delivery ${money(c.delivery)} · tax ${money(c.tax)}<span>Delivery and tax to ${DEMO_ZIP} are estimates; each store's checkout has the final word, and its pass covers it.</span>`;
  $('#permitLine').textContent = permitLine(c);
  $('#caps').innerHTML = c.stores
    .map((s) => `<li>${brick(s.store)}<span>${esc(s.name)}<small>${money(s.items)} + ${s.delivery ? `${money(s.delivery)} ${s.how === 'delivery' ? 'delivery' : 'shipping'}` : 'pickup'} + ${money(s.tax)} tax</small></span>${asksAt(s.amount) ? '<span class="ask-tag">asks you</span>' : ''}<span class="cap">up to ${money(s.amount)}</span></li>`)
    .join('');
  $('#askChips').innerHTML = ASK_CHOICES.map((o) => `<button type="button" class="chip" role="radio" aria-checked="${o.v === state.askOver}" data-v="${o.v}">${o.label}</button>`).join('');
  $('#passNote').textContent = `Each pass works at one store only, up to its amount, for 30 minutes. Nothing can be bought after ${prettyDate(c.partyDate)}.`;
  $('#startOver').hidden = false;
  document.body.classList.add('reviewing');
  $('#permitErr').hidden = true;
  const waiting = pending().length;
  $('#shopBtn').disabled = Boolean(waiting);
  $('#shopBtn').textContent = `Approve ${money(c.total)} and shop`;
  renderSteps();
}

// The whole permission in one plain sentence. The details are one tap away.
function permitLine(c) {
  const askers = c.stores.filter((s) => asksAt(s.amount));
  const when = `Nothing is charged until you say go, and nothing after ${prettyDate(c.partyDate)}.`;
  if (state.askOver === 0) return `I'll check with you before paying each store. ${when}`;
  if (state.askOver == null) return `I won't stop to ask, unless a store wants more than you approved. ${when}`;
  if (!askers.length) return `Every store is under ${money(state.askOver)}, so I won't need to stop unless something changes. ${when}`;
  const names = askers.map((s) => `${s.name} (${money(s.amount)})`).join(' and ');
  return `I'll check with you before ${names}, since ${askers.length > 1 ? "they're" : "it's"} over ${money(state.askOver)}. ${when}`;
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
  const head = `<div class="row">${cls === 'working' ? '<span class="spin" aria-hidden="true"></span>' : brick(store)}<b>${esc(STORES[store].name)}</b><span class="amt">${amount != null ? money(amount) : ''}</span></div>`;
  // A paid store is one quiet line; the pass and Stripe details open on tap.
  if (cls === 'paid') {
    // If the pass refused something first, that stays visible: it's the point of the demo.
    const refused = (state.log?.[store] || []).filter((e) => e.kind === 'refused');
    const story = refused.length ? `<span class="status refused-note">The pass refused ${money(refused[0].amount)} first. You approved ${money(refused[0].amount - refused[0].cap)} more.</span>` : '';
    li.innerHTML = `<details class="paid-row"><summary>${head}<span class="status">✓ ${status}</span>${story}</summary>${pass ? `<span class="pass">${esc(pass)}</span>` : ''}${hood ? hoodHtml(store, hood, true) : ''}</details>`;
    return li;
  }
  li.innerHTML = `${head}
    <span class="status">${status}</span>${pass ? `<span class="pass">${esc(pass)}</span>` : ''}${hood ? hoodHtml(store, hood) : ''}${acts ? `<div class="acts">${acts}</div>` : ''}`;
  return li;
}

// ---------- focus, spotlight and handoff ----------

// While the agent shops, the run takes the stage and the cart shrinks to one card.
function focusRun(on) {
  document.body.classList.toggle('shopping', on);
  if (on) document.body.classList.remove('reviewing');
  const c = state.cart;
  $('#cartMini').hidden = !on;
  if (on) $('#cartMiniText').textContent = `${c.items.length} items from ${c.stores.length} stores · ${money(c.total)} of ${money(budgetOf(c))}`;
}

// The queue: one brick per store, in shopping order, colored as each one finishes.
function renderQueue(c) {
  $('#queue').innerHTML = [...c.stores].sort((a, b) => a.amount - b.amount).map((s) => `<li data-q="${esc(s.store)}" class="waiting" title="${esc(s.name)}">${brick(s.store)}<span>${esc(s.name)}</span></li>`).join('');
}
function queueSet(store, cls) {
  let li = $(`#queue [data-q="${store}"]`);
  if (!li) { $('#queue').insertAdjacentHTML('beforeend', `<li data-q="${esc(store)}">${brick(store)}<span>${esc(STORES[store].name)}</span></li>`); li = $(`#queue [data-q="${store}"]`); }
  li.className = cls;
}

// The store being bought from, with the steps from the diagram as they happen.
function spotlight(store, amount, step) {
  const steps = [
    ['Checking your permission', 'Checked your permission'],
    [`Making a pass: ${money(amount)}, ${STORES[store].name} only, 30 minutes`, `Made a pass: ${money(amount)}, ${STORES[store].name} only, 30 minutes`],
    ['Store charging the pass', 'Store charged the pass'],
  ];
  const li = row(store);
  li.className = 'working spot';
  li.innerHTML = `<div class="row">${brick(store)}<b>${esc(STORES[store].name)}</b><span class="amt">${money(amount)}</span></div>
    <ol class="steps">${steps.map(([now, done], i) => `<li class="${i < step - 1 ? 'done' : i === step - 1 ? 'now' : ''}">${esc(i < step - 1 ? done : now)}</li>`).join('')}</ol>`;
}

// The handoff: the agent stops for a stated reason, says what it did and what it suggests,
// and says what happens next. You decide; the receipt records that you did.
function handoff({ title, why, suggest, next, acts, link }) {
  const paidN = Object.keys(state.paid).filter((s) => !state.paid[s].refunded).length;
  const spent = spentTotal();
  $('#hoTitle').textContent = title;
  $('#hoWhy').innerHTML = why;
  $('#hoSoFar').textContent = paidN ? `Paid ${paidN} store${paidN > 1 ? 's' : ''}, ${money(spent)} of ${money(budgetOf(state.cart))}.` : 'Nothing paid yet.';
  $('#hoSuggest').textContent = suggest;
  $('#hoNext').textContent = next || '';
  $('#hoActs').innerHTML = acts.map(([v, label, cls]) => `<button class="${cls}" data-choice="${v}" type="button">${esc(label)}</button>`).join('') + (link ? `<a class="link-btn" href="${esc(link)}" target="_blank" rel="noopener noreferrer">See the listing</a>` : '');
  mood($('#hoFace'), 'brow');
  mood($('#runFace'), 'brow');
  $('#handoff').hidden = false;
  document.body.classList.add('handing-off');
  $('#hoActs .go, #hoActs .ghost-btn')?.focus();
  return choice($('#hoActs')).then((v) => {
    $('#handoff').hidden = true;
    document.body.classList.remove('handing-off');
    return v;
  });
}

// "Under the hood": the objects behind a row. Real Stripe ids in test mode, labeled when simulated.
function hoodHtml(store, h, flat = false) {
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
    h.paymentMethod && ['Draws on', `<code>${esc(h.paymentMethod)}</code>${h.savedCard ? ' (the card you saved)' : h.sample ? '' : " (Stripe's test Visa; the saved card wasn't accepted by the test helper)"}`],
    ['Store charged', `${money(h.asked)}${over ? `, ${money(h.asked - h.cap)} over the limit` : ''}`],
    ['Result', result],
    h.paymentIntent && ['PaymentIntent', `<code>${esc(h.paymentIntent)}</code>${h.piStatus ? ` (${esc(h.piStatus)})` : ''}`],
    (h.code || h.declineCode) && ['Stripe code', `<code>${esc([h.code, h.declineCode].filter(Boolean).join(' / '))}</code>`],
  ].filter(Boolean);
  const dl = `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  return flat ? `<div class="hood">${dl}</div>` : `<details class="hood"><summary>Under the hood</summary>${dl}</details>`;
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
    await ensureWallet();
    const p = await api('/api/permit', { items: c.items.map((i) => ({ id: i.id, qty: i.qty })), budget: c.budget, askOver: state.askOver, partyDate: c.partyDate, wallet: state.wallet });
    Object.assign(state, { permission: p.permission, signature: p.signature, perm: p.perm, approvedPerm: p.perm, rows: {}, paid: {}, log: {}, extraPermits: [], cancelUsed: false, priceUpStore: null, overchargeUsed: false, dance: null });
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
  $('#runTitle').textContent = 'Out getting the party…';
  renderCake([...c.stores].sort((a, b) => a.amount - b.amount));
  mood($('#runFace'), 'working');
  focusRun(true);
  renderQueue(c);
  $('#runSheet').scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' });

  // Smallest first, so the easy ones go through while you watch.
  const order = [...c.stores].sort((a, b) => a.amount - b.amount);
  for (const s of order) await buy(s.store, s.amount);

  finishRun();
  state.busy = false;
}

async function buy(store, amount, { approved = false } = {}) {
  queueSet(store, 'working');
  mood($('#runFace'), 'working');
  spotlight(store, amount, 1);
  await wait(calm() ? 0 : 450);
  spotlight(store, amount, 2);
  let r;
  try {
    r = await api('/api/buy', { permission: state.permission, signature: state.signature, store, approved, curveball: null });
    if (r.status === 'paid' || r.status === 'blocked') { spotlight(store, amount, 3); await wait(calm() ? 0 : 450); }
  } catch (ex) {
    queueSet(store, 'blocked');
    candle(store, 'out');
    logEvent(store, { kind: 'skipped', why: `It didn't go through: ${ex.message}` });
    paint(store, { cls: 'blocked', amount, status: esc(ex.message) });
    return;
  }

  if (r.status === 'paid') {
    state.paid[store] = { amount: r.amount, payment: r.payment };
    queueSet(store, 'paid');
    logEvent(store, { kind: 'paid', amount: r.amount, hood: r.hood });
    candle(store, 'lit');
    mood($('#runFace'), 'happy');
    paint(store, { cls: 'paid', amount: r.amount, status: `${esc(partyLine(store))} <span class="paid-amt">Paid ${money(r.amount)}${r.sample ? ' (sample)' : ''}</span>`, pass: passLine(r.pass, 'used once, now closed'), hood: r.hood });
    await wait(calm() ? 0 : 500);
    return;
  }

  if (r.status === 'ask') {
    queueSet(store, 'asking');
    paint(store, { cls: 'asking', amount, status: 'Waiting for you.' });
    const s = state.cart.stores.find((x) => x.store === store);
    const items = state.cart.items.filter((i) => i.store === store);
    const pick = await handoff({
      title: `Approve ${money(amount)} at ${STORES[store].name}?`,
      why: `It's over your ${money(state.askOver)} ask-me amount.`,
      suggest: `Approve. ${items.map((i) => i.name).join(', ')}${items.some((i) => i.offTheme) && state.decided[items[0].id] === 'kept' ? ' (you already chose to keep it)' : ''}.`,
      next: `If you approve, I make a ${money(amount)} pass for ${STORES[store].name} only, good for 30 minutes, and the store charges it.`,
      acts: [['yes', `Approve ${money(amount)}`, 'go'], ['no', 'Skip this store', 'ghost-btn']],
      link: items[0]?.url,
      store: s?.store,
    });
    if (pick === 'yes') {
      logEvent(store, { kind: 'asked', amount });
      return buy(store, amount, { approved: true });
    }
    queueSet(store, 'skipped');
    candle(store, 'out');
    logEvent(store, { kind: 'skipped', why: 'You chose Skip at the ask-me step.' });
    paint(store, { amount: null, status: 'Skipped. Nothing charged.' });
    return;
  }

  if (r.status === 'blocked') {
    const more = r.asked - r.cap;
    logEvent(store, { kind: 'refused', amount: r.asked, cap: r.cap, hood: r.hood, railsMissed: r.railsMissed });
    // The what-if happens at one rental only, not again at a replacement.
    if (more > 0) state.priceUpStore ||= store;
    queueSet(store, 'blocked');
    paint(store, {
      cls: 'blocked',
      amount: r.asked,
      status: esc(r.why),
      pass: passLine(r.pass, `refused ${money(r.asked)}${r.railsMissed ? ' (refunded at once)' : ''}`),
      hood: r.hood,
    });
    const pick = await handoff({
      title: more > 0 ? `${STORES[store].name} asked for ${money(more)} more` : `${STORES[store].name} didn't go through`,
      why: more > 0 ? `You approved ${money(r.cap)}; the store asked for ${money(r.asked)}. ${r.hood?.decidedBy === 'stripe' ? 'Stripe refused it.' : 'The pass refused it.'}` : esc(r.why),
      suggest: more > 0 ? 'Check what the extra is for before approving. A surprise fee is worth a question to the store.' : 'Skip it, and I\'ll tell you what\'s missing at the end.',
      next: more > 0 ? `If you approve, I make a new ${money(r.asked)} pass for this store only. Your total stays under ${money(budgetOf(state.cart))}.` : '',
      acts: more > 0 ? [['raise', `Approve ${money(more)} more`, 'go'], ['no', 'Skip this store', 'ghost-btn']] : [['no', 'OK', 'ghost-btn']],
      link: state.cart.items.find((i) => i.store === store)?.url,
    });
    if (pick === 'raise') {
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
    queueSet(store, 'skipped');
    candle(store, 'out');
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
  const missingList = missingNow();
  $('#runTitle').textContent = !missingList.length && paid ? 'Everything’s booked.' : paid ? `${paid} of ${all} stores paid` : 'Nothing was bought';
  mood($('#runFace'), missingList.length ? 'brow' : 'happy');
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
  // The overcharge test needs a paid store that's in the current permission; the rental if there is one.
  const target = [rental, ...Object.keys(state.paid)].find((s) => s && state.perm?.stores[s] && !state.paid[s].refunded);
  $('#overcharge').dataset.store = target || '';
  $('#overcharge').hidden = !target || state.overchargeUsed;
  $('#limits').hidden = $('#overcharge').hidden && $('#cancelRental').hidden;
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
    candle(store, 'out');
    logEvent(store, { kind: 'refunded', amount: p.amount, refund: r.id });
    renderReceipt();
    paint(store, { cls: 'refunded', amount: p.amount, status: `Test: the rental cancelled. ${money(p.amount)} refunded to your card${r.sample ? ' (sample)' : ''}.` });
    renderSpent();
    b.hidden = true;
    finishRun();
  } catch (ex) {
    $('#ledgerNote').textContent = ex.message;
  } finally {
    b.removeAttribute('aria-busy');
  }
}

// Stress test: a fresh pass for one store, and the store asks for $20 more than it.
async function overcharge() {
  const store = $('#overcharge').dataset.store;
  if (!store || state.busy) return;
  state.busy = true;
  const b = $('#overcharge');
  b.setAttribute('aria-busy', 'true');
  const key = `test-${store}`;
  const li = row(key);
  li.className = 'working';
  li.innerHTML = `<div class="row"><span class="spin" aria-hidden="true"></span><b>Test: ${esc(STORES[store].name)} charges $20 more…</b></div>`;
  try {
    const r = await api('/api/buy', { permission: state.permission, signature: state.signature, store, test: true });
    const h = r.hood;
    const who = h?.decidedBy === 'stripe' ? 'Stripe refused it' : h?.decidedBy === 'simulator' ? 'Our simulator refused it (no Stripe key)' : 'Stripe let it through, so our code refunded it at once';
    logEvent(store, { kind: 'tested', amount: r.asked, cap: r.cap, hood: h, railsMissed: r.railsMissed });
    li.className = r.railsMissed ? 'blocked' : 'tested';
    li.innerHTML = `<div class="row">${brick(store)}<b>Test: ${esc(STORES[store].name)}</b><span class="amt">${money(r.asked)}</span></div>
      <span class="status">A new pass for ${money(r.cap)}, and the store tried ${money(r.asked)}. ${who}.${h?.message && h.decidedBy === 'stripe' ? ` <q>${esc(h.message)}</q>` : ''}</span>
      ${h ? hoodHtml(store, h) : ''}`;
    state.overchargeUsed = true;
    b.hidden = true;
    renderReceipt();
  } catch (ex) {
    li.className = 'blocked';
    li.innerHTML = `<div class="row">${brick(store)}<b>Test didn't run</b></div><span class="status">${esc(ex.message)}</span>`;
  } finally {
    state.busy = false;
    b.removeAttribute('aria-busy');
  }
}

// ---------- when something falls through ----------

// What the party should have (everything that was in the approved cart) but doesn't now.
function missingNow() {
  const got = (store) => state.paid[store] && !state.paid[store].refunded;
  const cats = [...new Set([...state.cart.items.map((i) => i.category), ...(state.cart.asked || []).filter((c) => WHAT[c] && !state.declined.has(c))])];
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
    ${miss.filter((m) => state.noneLeft[m]).map((m) => `<p class="note">${esc(state.noneLeft[m])}</p>`).join('')}
    <div class="acts">${miss.filter((m) => !state.noneLeft[m]).map((m) => `<button class="go" data-find="${m}">Find another ${esc(WHAT[m])}</button>`).join('')}</div>`;
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
    const r = await api('/api/replace', { category: cat, partyDate: c.partyDate, excludeStores: tried, maxCents: room, theme: c.theme, little: Boolean(c.little) });
    if (!r.item) {
      state.noneLeft[cat] = r.why;
      li.className = 'blocked';
      li.innerHTML = `<div class="row">${brick(tried[0])}<b>No other ${esc(WHAT[cat])}</b></div><span class="status">${esc(r.why)}</span>`;
      return;
    }
    const it = r.item;
    const q = r.quote;
    li.className = 'asking';
    li.innerHTML = `<div class="row">${brick(it.store)}<b>${esc(it.storeName)}</b><span class="amt">${money(q.total)}</span></div><span class="status">Waiting for you.</span>`;
    const pick = await handoff({
      title: `Book ${it.storeName} instead?`,
      why: `The party has no ${esc(WHAT[cat])} now${tried.some((t) => state.paid[t]?.refunded) ? ' (the test cancellation)' : ''}. A replacement is new spending, so it's your call.`,
      suggest: `${it.name}, ${money(it.amount)} plus ${money(q.delivery + q.tax)} estimated delivery and tax, free on ${prettyDate(c.partyDate)}.${it.offTheme ? ` It isn't ${themeWord(c.theme)}-themed.` : ''}`,
      next: `If you approve, it's a second, separate permission: ${money(q.total)} for ${it.storeName} only. Your first approval doesn't stretch to cover it.`,
      acts: [['yes', `Approve ${money(q.total)}`, 'go'], ['no', 'Not now', 'ghost-btn']],
      link: it.url,
    });
    if (pick !== 'yes') {
      li.className = '';
      li.innerHTML = `<div class="row">${brick(it.store)}<b>${esc(it.storeName)}</b></div><span class="status">You passed on it. Nothing charged.</span>`;
      return;
    }
    li.remove();
    delete state.rows[key];
    // A second, separate permission: this store only, this amount only, within what's left.
    const p = await api('/api/permit', { items: [{ id: it.id, qty: 1 }], budget: room, askOver: state.askOver, partyDate: c.partyDate, wallet: state.wallet });
    Object.assign(state, { permission: p.permission, signature: p.signature, perm: p.perm });
    state.caps[it.store] = { approved: q.total, final: q.total };
    state.extraPermits.push({ id: p.perm.id, amount: q.total, storeName: it.storeName, reason: tried.some((s) => state.paid[s]?.refunded) ? 'rental cancelled' : `${WHAT[cat]} fell through` });
    c.items.push(it);
    regroup(c);
    await buy(it.store, q.total, { approved: true });
  } catch (ex) {
    li.className = 'blocked';
    li.innerHTML = `<div class="row"><b>Couldn't find another ${esc(WHAT[cat])}</b></div><span class="status">${esc(ex.message)}</span>`;
  } finally {
    state.busy = false;
    finishRun();
  }
}

// ---------- the success view: the cake's victory dance, then the receipt ----------

// One move per run, picked at random, and named on the receipt.
const MOVES = { moonwalk: 'The Moonwalk', twist: 'The Twist', hop: 'The Bunny Hop', spin: 'The Spin', robot: 'The Robot', sprinkler: 'The Sprinkler' };
const danceMove = () => (state.dance ||= Object.keys(MOVES)[Math.floor(Math.random() * Object.keys(MOVES).length)]);

function openSuccess() {
  renderReceipt();
  const { held, net, miss } = verdict();
  const budget = budgetOf(state.cart);
  const complete = !miss.length && held;
  // A complete party gets the victory dance (and confetti). Otherwise the cake taps its foot.
  const move = complete ? danceMove() : 'wait';
  const d = $('#dancer');
  d.className = 'dancer';
  void d.offsetWidth;
  d.classList.add(`m-${move}`);
  $('#danceMove').textContent = complete ? `Victory dance: ${MOVES[move]}` : 'Saving the victory dance for when the party is complete.';
  $('#danceWrap').querySelectorAll('.confetti').forEach((x) => x.remove());
  if (complete) $('#danceWrap').insertAdjacentHTML('beforeend', Array.from({ length: 16 }, (_, i) => `<i class="confetti" style="--x:${(i * 37) % 100}%;--d:${200 + (i % 5) * 110}ms;background:${['#FF6B57', '#1FB5A8', '#FFD23F'][i % 3]}"></i>`).join(''));
  $('#successTitle').innerHTML = miss.length ? 'Almost <i>there.</i>' : 'Party’s <i>on.</i>';
  $('#successSub').textContent = `${miss.length ? '' : bookedLine()}${money(net)} spent of your ${money(budget)} budget${held ? ', never more than you approved' : ''}.${miss.length ? ` Still missing: ${miss.map((m) => WHAT[m]).join(', ')}.` : ''}`;
  $('#successActs').innerHTML = miss.length ? (state.noneLeft[miss[0]] ? '' : `<button class="go" id="goFind" data-cat="${miss[0]}" type="button">Find another ${esc(WHAT[miss[0]])}</button>`) : '';
  $('main.layout').hidden = true;
  $('#success').hidden = false;
  window.scrollTo(0, 0);
  $('#successTitle').focus({ preventScroll: true });
}

function closeSuccess() {
  $('#success').hidden = true;
  $('main.layout').hidden = false;
  $('#ledger').scrollIntoView({ block: 'center' });
}

// The same check as the receipt's verdict.
function verdict() {
  const { net, overPass } = receiptData();
  return { held: !overPass && net <= budgetOf(state.cart), net, miss: missingNow() };
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
    if (e.kind === 'refunded') lines.push(`Refunded ${money(e.amount)} (test: the rental cancelled).`);
    if (e.kind === 'tested') lines.push(`Stress test: a new ${money(e.cap)} pass, and the store tried ${money(e.amount)}. ${WHO[e.hood?.decidedBy] || 'Refused'}.`);
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
    ['Paid with', state.wallet ? `${cap1(state.wallet.brand)} •••• ${state.wallet.last4}, saved with Stripe when you approved${state.wallet.sample ? ' (simulated)' : ' (test mode)'}` : 'Stripe test Visa'],
    ['Delivering to', `ZIP ${DEMO_ZIP} (demo). Delivery and tax were estimates inside each store's limit.`],
    ['Each pass', 'One store, one charge, up to its limit, for 30 minutes'],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  const agent = [
    state.mode === 'claude' ? 'Claude planned the cart from the store listings.' : 'The rules-based agent planned the cart (Claude didn’t this time).',
    ...c.notes,
    ...c.ignored.map((x) => `Ignored an instruction hidden in a listing from ${x.store}${STORES.brickyard && x.store === STORES.brickyard.name ? ' (our made-up test store)' : ''}, and bought nothing because of it.`),
    ...c.items.filter((i) => state.decided[i.id] === 'kept').map((i) => `You kept the ${i.name}, knowing it isn't ${themeWord(c.theme)}-themed.`),
    ...state.extraPermits.map((x) => `After the ${x.reason}, you approved a second permission: ${money(x.amount)} for ${x.storeName} only.`),
    'It never held your card. The server made each pass from your saved card, after you approved.',
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
  $('#rcptComplete').textContent = miss.length ? `The party isn't complete: no ${miss.map((m) => WHAT[m]).join(', no ')}.` : `The party is complete: every part of it is paid for. Victory dance: ${MOVES[danceMove()]}.`;
}

function copyReceipt() {
  const { c, perm, ask, charged, refunded, net } = receiptData();
  const out = [
    `Cakewalk permission receipt (${perm.id}), test mode`,
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
  $('#success').hidden = true;
  $('main.layout').hidden = false;
  focusRun(false);
  document.body.classList.remove('reviewing');
  $('#changeForm').hidden = true;
  state.opts = null;
  Object.assign(state, { overchargeUsed: false, noneLeft: {}, declined: new Set(), changes: [], locked: false, priceUpStore: null, decided: {}, caps: {}, extraPermits: [], cancelUsed: false, log: {}, approvedPerm: null, cart: null, trick: null, permission: null, signature: null, perm: null, rows: {}, paid: {} });
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
  $('#overcharge').addEventListener('click', overcharge);
  $('#startOver').addEventListener('click', startOver);
  $('#again').addEventListener('click', startOver);
  $('#rcptPrint').addEventListener('click', () => window.print());
  $('#seeReceipt').addEventListener('click', openSuccess);
  $('#backToRun').addEventListener('click', closeSuccess);
  // Straight to the search: back to the run and start looking, in one tap.
  $('#successActs').addEventListener('click', (e) => {
    const cat = e.target.closest('#goFind')?.dataset.cat;
    if (!cat) return;
    closeSuccess();
    $(`#missing [data-find="${cat}"]`)?.click();
  });
  $('#changeOpen').addEventListener('click', () => {
    const f = $('#changeForm');
    f.hidden = !f.hidden;
    $('#changeOpen').setAttribute('aria-expanded', String(!f.hidden));
    if (!f.hidden) $('#changeText').focus();
  });
  $('#askedMissing').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]')?.dataset.add;
    const no = e.target.closest('[data-nocat]')?.dataset.nocat;
    if (add) changeCart({ add }, `Add a ${WHAT[add]}`);
    if (no) { state.declined.add(no); renderAskedMissing(); }
  });
  $('#cartGroups').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (b) return changeCart({ set: { id: b.dataset.id, qty: Number(b.dataset.q) } }, null);
    const o = e.target.closest('[data-opts]')?.dataset.opts;
    if (o) { state.opts = state.opts === o ? null : o; return renderGroups(); }
    const to = e.target.closest('[data-swap]');
    if (to) return changeCart({ swap: { from: to.dataset.from, to: to.dataset.swap } }, null);
    decide(e);
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

// ---------- the card: asked for at the go-ahead, saved when she approves ----------

function showWallet() {
  const w = state.wallet;
  if (!w) return;
  $('#cardNote').innerHTML = `${esc(cap1(w.brand))} •••• ${esc(w.last4)} is saved with Stripe${w.sample ? ' (simulated)' : ', test mode'}. Cakewalk never sees your card: each store only gets a one-time pass for its amount. <a href="#faqPay">How passes work ↓</a>`;
}
// Saving the card is part of approving: Stripe keeps it, and every pass draws on it.
async function ensureWallet() {
  if (state.wallet) return state.wallet;
  state.wallet = (await api('/api/setup', {})).wallet;
  try { sessionStorage.setItem('partyRunWallet', JSON.stringify(state.wallet)); } catch {}
  showWallet();
  return state.wallet;
}

// The cake moonwalks when tapped. Reduced motion: it stays put.
function moonwalk() {
  const l = $('#logo');
  if (calm()) return;
  l.classList.remove('walk');
  void l.offsetWidth;
  l.classList.add('walk');
  setTimeout(() => l.classList.remove('walk'), 2300);
}

async function init() {
  bind();
  $('#logo').addEventListener('click', moonwalk);
  try { const w = JSON.parse(sessionStorage.getItem('partyRunWallet') || 'null'); if (w?.customer) { state.wallet = w; showWallet(); } } catch {}
  $('#askText').value = REAL;
  // The request is fixed, so the box is exactly as tall as the words.
  const fit = () => { const t = $('#askText'); t.style.height = 'auto'; t.style.height = `${t.scrollHeight + 4}px`; };
  fit();
  addEventListener('resize', fit);
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

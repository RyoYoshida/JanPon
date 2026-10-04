import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDisplay } from '../../src/adapters/dom.ts';
const html = await readFile(new URL('../../game/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../../game/style.css', import.meta.url), 'utf8');
const approved = await readFile(new URL('../../mock/index.html', import.meta.url), 'utf8');

// Small deterministic adapter harness, not a browser or a layout/accessibility conformance test.
class Element {
  constructor(attributes = '') {
    this.attributes = Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    this.dataset = Object.fromEntries(Object.entries(this.attributes).filter(([k]) => k.startsWith('data-')).map(([k, v]) => [k.slice(5), v]));
    this.classes = new Set((this.attributes.class ?? '').split(' '));
    this.classList = { toggle: (name, value) => value ? this.classes.add(name) : this.classes.delete(name), contains: name => this.classes.has(name) };
    this.style = {}; this.disabled = /\bdisabled\b/.test(attributes); this.hidden = /\bhidden\b/.test(attributes);
    this.innerHTML = ''; this.textContent = ''; this.listeners = new Map();
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  click() { if (!this.disabled) this.listeners.get('click')?.({ stopPropagation() {} }); }
}
function harness() {
  const ids = new Map([...html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)].map(m => [m[1], new Element(m[0])]));
  const machine = new Element('class="machine"'), display = new Element('class="display"');
  const hands = [...html.matchAll(/<button[^>]*\bdata-hand="[^"]+"[^>]*>/g)].map(m => new Element(m[0]));
  const lamps = [...html.matchAll(/<rect class="lamp"[^>]*>/g)].map(m => new Element(m[0]));
  const timers = new Map(); let next = 0, elapsed = 0;
  const root = {
    querySelector: selector => selector === '.machine' ? machine : selector === '.display' ? display : ids.get(selector.slice(1)),
    querySelectorAll: selector => selector === '.controls button' ? hands : selector === '.lamp' ? lamps : [],
    defaultView: { setTimeout(callback, duration) { const id = ++next; timers.set(id, { callback, duration }); return id; }, clearTimeout(id) { timers.delete(id); } },
  };
  const ui = createDisplay(root), choices = []; let retries = 0;
  ui.bind(index => choices.push(index), () => { retries++; });
  return { ui, ids, machine, display, hands, lamps, choices, timers, get elapsed() { return elapsed; }, get retries() { return retries; },
    async tick() { const entry = timers.entries().next().value; if (!entry) return false; const [id, timer] = entry; timers.delete(id); elapsed += timer.duration; timer.callback(); await Promise.resolve(); return true; },
    async drain() { while (await this.tick()) {} },
  };
}
const idle = { phase: 'idle', balance: 10, choices: [{ kind: 'coin' }], result: null };
const choosing = { phase: 'choosing', balance: 9, choices: [{ kind: 'hand', hand: 'rock' }, { kind: 'hand', hand: 'scissors' }, { kind: 'hand', hand: 'paper' }], result: null };
const win = { phase: 'result', balance: 9, choices: [], result: { player: 'rock', opponent: 'scissors', outcome: 'win', payout: 20 } };
const draw = { ...choosing, result: { player: 'rock', opponent: 'rock', outcome: 'draw', payout: 0 } };

test('T07-04 live shell preserves the approved 100 lamp art and broad coin-only target', () => {
  const lampTags = source => [...source.matchAll(/<rect class="lamp"[^>]*>/g)].map(m => m[0]);
  assert.deepEqual(lampTags(html), lampTags(approved));
  const weights = {}; for (const tag of lampTags(html)) { const value = tag.match(/data-value="(\d+)"/)[1]; weights[value] = (weights[value] ?? 0) + 1; }
  assert.deepEqual(weights, { 1: 65, 2: 18, 4: 11, 7: 5, 20: 1 });
  assert.match(html, /<header><h1>JanPon<\/h1><\/header>/);
  assert.equal((html.match(/data-hand=/g) ?? []).length, 3);
  assert.match(html, /<button id="coin-input"[^>]*type="button"[^>]*>[\s\S]*id="coin-target"[\s\S]*id="balance"[\s\S]*<\/button>/);
  assert.match(css, /button\.wallet\{[^}]*min-width:120px;min-height:56px[^}]*padding:12px/);
  assert.doesNotMatch(html + css, /palette|scenario-buttons|reset-demo|dialog/);
  const surface = html.replace(/<p[^>]*class="sr-only"[^>]*>[\s\S]*?<\/p>/g, '').replace(/<head>[\s\S]*?<\/head>/, '');
  const text = [...surface.matchAll(/>([^<>]+)</g)].map(m => m[1].trim()).filter(Boolean);
  assert.ok(text.every(value => value === 'JanPon' || /^\d+$/.test(value)), text.join(','));
  assert.match(html, /id="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html, /src="\.\.\/dist\/\.generated\/main.js"/);
});

test('T07-04 click mapping follows legal view indices, uses only native controls, and claims input immediately', () => {
  const h = harness(); h.ui.render(idle, 'ready', '');
  assert.equal(h.ids.get('coin-input').disabled, false); assert.ok(h.hands.every(b => b.disabled));
  h.machine.click(); h.display.click(); h.hands[0].click(); assert.deepEqual(h.choices, []);
  h.ids.get('coin-input').click(); h.ids.get('coin-input').click(); h.hands[0].click();
  assert.deepEqual(h.choices, [0]); assert.equal(h.ids.get('coin-input').disabled, true);
  h.ui.render({ ...choosing, choices: [choosing.choices[2], choosing.choices[0]] }, 'ready', '');
  assert.equal(h.hands[1].disabled, true); h.hands[0].click(); h.hands[2].click(); assert.deepEqual(h.choices, [0, 1]);
  h.ui.render(choosing, 'busy', ''); h.hands[2].click(); assert.deepEqual(h.choices, [0, 1]);
  assert.ok(h.hands.every(b => b.listeners.size === 1 && b.listeners.has('click')));
});

test('T07-04 loading, game over, errors and other-tab explain state without enabling new play', () => {
  const h = harness(); h.ui.render(null, 'new', '');
  assert.equal(h.ids.get('balance').textContent, ''); assert.match(h.ids.get('status').textContent, /未確認/);
  assert.equal(h.ids.get('coin-input').disabled, true);
  h.ui.render({ phase: 'game-over', balance: 0, choices: [{ kind: 'restart' }], result: win.result }, 'ready', '');
  assert.equal(h.machine.dataset.phase, 'game-over'); assert.equal(h.ids.get('restart').hidden, false);
  assert.match(h.ids.get('status').textContent, /10枚/); h.ids.get('restart').click(); assert.deepEqual(h.choices, [0]);
  for (const status of ['stopped', 'other-tab']) {
    h.ui.render(choosing, status, 'test failure');
    assert.equal(h.machine.dataset.phase, status); assert.ok(h.hands.every(b => b.disabled));
    assert.equal(h.ids.get('coin-input').disabled, true); assert.equal(h.ids.get('restart').hidden, true);
    assert.equal(h.ids.get('retry').hidden, false); assert.ok(h.ids.get('state-indicator').innerHTML);
    assert.match(h.ids.get('status').textContent, /再読み込み/); assert.match(h.ids.get('status').textContent, /test failure/);
    h.ids.get('retry').click(); h.ids.get('retry').click();
  }
  assert.equal(h.retries, 2); assert.deepEqual(h.choices, [0]);
  h.ui.render(idle, 'closed', ''); assert.equal(h.ids.get('retry').hidden, true);
});

test('T07-04 outcomes show Japanese labels and distinct presentation modes; draws remain free choosing', async () => {
  const h = harness(), symbols = new Set();
  for (const view of [idle, choosing, draw, win, { ...win, result: { ...win.result, outcome: 'loss', payout: 0 } }]) {
    h.ui.render(view, 'ready', ''); symbols.add(`${h.ids.get('state-indicator').dataset.scene}:${h.machine.dataset.outcome}`);
    if (view.result) assert.match(h.ids.get('status').textContent, /あなたはグー、相手は/);
  }
  assert.equal(symbols.size, 5);
  h.ui.render(draw, 'ready', ''); assert.match(h.ids.get('status').textContent, /あいこ.*追加投入なし/);
  const animation = h.ui.animate(draw); assert.ok(h.hands.every(b => b.disabled));
  await h.drain(); await animation; assert.equal(h.elapsed, 450);
  assert.ok(h.hands.every(b => !b.disabled)); assert.equal(h.ids.get('coin-input').disabled, true);
});

test('T07-04 roulette visits lamps then lands only on the committed prize without mutating the view', async () => {
  for (const payout of [1, 2, 4, 7, 20]) {
    const h = harness(), view = structuredClone(win); view.result.payout = payout;
    const original = structuredClone(view); h.ui.render(view, 'ready', '');
    const animation = h.ui.animate(view), lit = new Set();
    do { const index = h.lamps.findIndex(l => l.classes.has('active')); if (index >= 0) lit.add(index); } while (await h.tick());
    await animation;
    assert.ok(lit.size > 1); assert.equal(h.elapsed, 1800);
    assert.deepEqual(h.lamps.filter(l => l.classes.has('active')).map(l => l.dataset.value), [String(payout)]);
    assert.equal(h.ids.get('prize').textContent, String(payout)); assert.deepEqual(view, original);
    assert.equal(h.ids.get('balance').textContent, '9'); assert.ok(h.hands.every(b => b.disabled));
  }
});

test('T07-04 a later render cancels animation and cannot relight or re-enable stopped play', async () => {
  for (const view of [win, draw]) {
    const h = harness(); h.ui.render(view, 'ready', ''); const animation = h.ui.animate(view);
    await h.tick(); h.ui.render(view, 'stopped', 'storage interrupted'); await animation; await h.drain();
    assert.equal(h.timers.size, 0); assert.equal(h.ids.get('prize').textContent, '');
    assert.ok(h.lamps.every(l => !l.classes.has('active'))); assert.ok(h.hands.every(b => b.disabled));
  }
});

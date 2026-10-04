import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { centralScene, sceneFor } from '../../src/adapters/central-scene.ts';
import { createDisplay } from '../../src/adapters/dom.ts';
import { startBundle, createSharedState } from '../helpers/browser-harness.mjs';

// DOM/API contract and CSS-source evidence only. This does not execute CSS layout/animation.
const idle = { phase: 'idle', balance: 10, choices: [{ kind: 'coin' }], result: null };
const choosing = { phase: 'choosing', balance: 9, choices: ['rock','scissors','paper'].map(hand => ({ kind:'hand', hand })), result: null };
const win = { phase:'result', balance:9, choices:[], result:{ player:'paper', opponent:'rock', outcome:'win', payout:20 } };
const draw = { ...choosing, result:{ player:'rock', opponent:'rock', outcome:'draw', payout:0 } };
const loss = { ...win, result:{ player:'scissors', opponent:'rock', outcome:'loss', payout:0 } };
const over = { phase:'game-over', balance:0, choices:[{ kind:'restart' }], result:loss.result };
const center = ui => ui.ids.get('state-indicator');

async function winBundle(options = {}) {
  const ui = await startBundle(options);
  ui.click('#coin-input'); await ui.flush();
  ui.click('[data-hand="paper"]'); await ui.flush();
  assert.equal(ui.savedState.round.result.outcome, 'win');
  return ui;
}

test('central graphics cover all public phases and operational statuses without lower-left space', async t => {
  const ui = await startBundle({ runBundle:false }); t.after(() => ui.close());
  const display = createDisplay(ui.document), seen = new Set();
  const cases = [[null,'new','loading'],[null,'busy','loading'],[idle,'busy','saving'],[idle,'ready','waiting'],
    [choosing,'ready','choosing'],[draw,'ready','draw-ready'],[win,'ready','win'],[loss,'ready','loss'],
    [over,'ready','game-over'],[win,'stopped','stopped'],[choosing,'other-tab','other-tab'],[idle,'closed','closed']];
  for (const [view,status,scene] of cases) {
    display.render(view,status,'');
    assert.equal(center(ui).dataset.scene, scene);
    assert.match(center(ui).innerHTML, /<svg/);
    assert.match(ui.ids.get('status').textContent, /残高/);
    assert.equal(center(ui).getAttribute('aria-hidden'), 'true');
    assert.equal(center(ui).textContent, '');
    assert.equal(ui.timers.size,0,'idle scenes must not create JS polling timers');
    if (scene !== 'loading' || !seen.has(center(ui).innerHTML)) seen.add(center(ui).innerHTML);
  }
  assert.equal(seen.size,8,'operational notices stay distinct; normal hand scenes intentionally share artwork');
  assert.equal(ui.ids.has('state-symbol'),false);
  assert.equal(ui.document.querySelector('.face > .state-controls'),null);
  for (const id of ['restart','retry']) assert.equal(ui.ids.get(id).closest('.display'),ui.display);
  assert.equal(ui.document.querySelectorAll('button[data-hand]').length,3);
});

test('waiting cycles are generic and neither saved opponents nor future prizes enter pre-choice graphics', async t => {
  for (const phase of ['idle','choosing']) {
    const base = phase === 'idle' ? idle : choosing;
    const markup = centralScene(sceneFor(base,'ready'),base);
    for (const opponent of ['rock','scissors','paper']) {
      const extra = { ...base, opponent, rngState:999, round:{ opponent, result:{ payout:20 } } };
      assert.equal(centralScene(sceneFor(extra,'ready'),extra),markup);
    }
    assert.equal((markup.match(/data-center-hand=/g) ?? []).length,3);
    assert.doesNotMatch(markup, /data-hand=|data-payout=|>20</);
  }
  const ui = await winBundle(); t.after(() => ui.close());
  assert.equal(center(ui).dataset.scene,'roulette');
  assert.equal(ui.ids.get('prize').textContent,'');
  for (const description of [ui.ids.get('status').textContent,ui.machine.getAttribute('aria-label'),ui.ids.get('ring').getAttribute('aria-label')]) assert.doesNotMatch(description,/配当\d+枚/);
  const before = ui.savedState;
  await ui.tick(1349);
  assert.equal(ui.ids.get('prize').textContent,'');
  await ui.tick(1);
  assert.equal(center(ui).dataset.scene,'payout');
  assert.equal(ui.ids.get('prize').textContent,String(before.round.result.payout));
  assert.match(ui.ids.get('status').textContent,new RegExp(`配当${before.round.result.payout}枚`));
  assert.deepEqual(ui.savedState,before,'presentation does not settle before its existing hold ends');
  await ui.drain();
  assert.equal(ui.savedState.balance,9 + before.round.result.payout);
});

test('every committed opponent and prize renders accurately without an early spoken payout', async t => {
  const ui = await startBundle({runBundle:false}); t.after(() => ui.close());
  const display = createDisplay(ui.document);
  for (const opponent of ['rock','scissors','paper']) for (const payout of [1,2,4,7,20]) {
    const view = { ...win, result:{ ...win.result, opponent, payout } }, original = structuredClone(view);
    display.render(view,'ready','');
    assert.equal(ui.document.querySelectorAll('[data-center-hand]').length,1);
    assert.equal(ui.document.querySelector('[data-center-hand]').dataset.centerHand,opponent);
    assert.equal(ui.document.querySelectorAll('[data-hand]').length,3);
    const presenting=display.animate(view);
    assert.equal(center(ui).dataset.scene,'roulette');
    for (const description of [ui.ids.get('status').textContent,ui.machine.getAttribute('aria-label'),ui.ids.get('ring').getAttribute('aria-label')]) assert.doesNotMatch(description,/配当\d+枚/);
    await ui.drain(); await presenting;
    assert.equal(center(ui).dataset.scene,'payout');
    assert.equal(ui.ids.get('prize').textContent,String(payout));
    assert.deepEqual(ui.lamps.filter(lamp=>lamp.classList.contains('active')).map(lamp=>lamp.dataset.value),[String(payout)]);
    for (const description of [ui.ids.get('status').textContent,ui.machine.getAttribute('aria-label'),ui.ids.get('ring').getAttribute('aria-label')]) assert.match(description,new RegExp(`配当${payout}枚`));
    assert.deepEqual(view,original); assert.equal(ui.timers.size,0);
  }
});

test('draw holds the committed opposing hand, then offers three shapes for the free next choice', async t => {
  const ui = await startBundle(); t.after(() => ui.close());
  ui.click('#coin-input'); await ui.flush(); ui.click('[data-hand="rock"]'); await ui.flush();
  assert.equal(center(ui).dataset.scene,'draw');
  assert.match(center(ui).innerHTML,/center-result-hand/);
  assert.equal(ui.document.querySelectorAll('[data-center-hand]').length,1);
  assert.ok(ui.hands.every(button => button.disabled));
  const before = ui.savedState, writes = ui.writes;
  await ui.tick(450);
  assert.equal(center(ui).dataset.scene,'draw-ready');
  assert.equal(ui.document.querySelectorAll('[data-center-hand]').length,3);
  assert.ok(ui.hands.every(button => !button.disabled));
  assert.equal(ui.ids.get('coin-input').disabled,true);
  assert.deepEqual(ui.savedState,before); assert.equal(ui.writes,writes);
  assert.match(ui.ids.get('status').textContent,/あいこ.*追加投入なし/);
});

test('state replacement cancels every pending result or shortened hold without stale center graphics', async t => {
  for (const interrupted of [win,draw,loss]) for (const status of ['ready','busy','stopped','other-tab','closed']) {
    const ui = await startBundle({ runBundle:false }); t.after(() => ui.close());
    const display = createDisplay(ui.document);
    display.render(interrupted,'ready','');
    const original = display.animate(interrupted);
    const shortened = display.finishPresentation();
    display.render(choosing,status,'interruption');
    const after = center(ui).innerHTML, scene = center(ui).dataset.scene;
    await Promise.all([original,shortened]); await ui.drain();
    assert.equal(center(ui).innerHTML,after); assert.equal(center(ui).dataset.scene,scene);
    assert.equal(ui.timers.size,0); assert.equal(ui.ids.get('prize').textContent,'');
    assert.ok(ui.lamps.every(lamp => !lamp.classList.contains('active')));
    assert.ok(ui.hands.every(button => button.disabled === (status !== 'ready')));
  }
});

test('page exit replaces CSS scenes, cancels timers and preserves the un-settled result for replay', async t => {
  for (const elapsed of [0,1350]) {
    const ui = await winBundle(); t.after(() => ui.close());
    await ui.tick(elapsed);
    const saved = ui.savedState, writes = ui.writes;
    await ui.close();
    assert.equal(center(ui).dataset.scene,'closed');
    assert.doesNotMatch(center(ui).innerHTML,/center-orbit|center-coins|center-cycle|center-result-hand/);
    assert.equal(ui.timers.size,0); assert.equal(ui.ids.get('prize').textContent,'');
    await ui.tick(20000);
    assert.deepEqual(ui.savedState,saved); assert.equal(ui.writes,writes);
    const resumed = await startBundle({ shared:ui.shared,reducedMotion:true }); t.after(() => resumed.close());
    await resumed.drain();
    assert.equal(resumed.savedState.balance,9 + saved.round.result.payout);
    const again = resumed.savedState; await resumed.close();
    const reloaded = await startBundle({shared:ui.shared}); t.after(() => reloaded.close());
    assert.deepEqual(reloaded.savedState,again);
  }
});

test('reduced mode changes shape animation only and repeated mid-result switches keep one payout', async t => {
  for (const mode of ['waiting','choosing','draw','roulette','payout']) {
    const ui = await startBundle(); t.after(() => ui.close());
    if (mode !== 'waiting') { ui.click('#coin-input'); await ui.flush(); }
    if (mode === 'draw') { ui.click('[data-hand="rock"]'); await ui.flush(); }
    if (mode === 'roulette' || mode === 'payout') { ui.click('[data-hand="paper"]'); await ui.flush(); }
    if (mode === 'payout') await ui.tick(1350);
    const saved = ui.savedState, writes = ui.writes;
    ui.click('#motion-toggle'); await ui.flush();
    assert.equal(ui.machine.dataset.motion,'reduced');
    assert.deepEqual(ui.savedState,saved); assert.equal(ui.writes,writes);
    for (let repeat=0; repeat<4; repeat++) ui.click('#motion-toggle');
    await ui.drain();
    if (saved.round?.result?.outcome === 'win') {
      assert.equal(ui.savedState.balance,9 + saved.round.result.payout);
      assert.equal(ui.writes,writes + 1);
    } else { assert.deepEqual(ui.savedState,saved); assert.equal(ui.writes,writes); }
    assert.equal(ui.timers.size,0);
  }
});

test('errors and competing tabs keep distinct central graphics and accessible non-destructive retry', async t => {
  const damaged = { schema:'bad',balance:27 };
  const blocked = await startBundle({savedState:damaged}); t.after(() => blocked.close());
  assert.equal(center(blocked).dataset.scene,'stopped');
  assert.match(blocked.ids.get('status').textContent,/保存は消しません/);
  assert.equal(blocked.ids.get('retry').disabled,false);
  blocked.focus('#retry'); blocked.pressKey('Enter');
  assert.equal(blocked.reloads,1); assert.deepEqual(blocked.savedState,damaged); assert.equal(blocked.writes,0);
  const shared = createSharedState(), first = await startBundle({shared}); t.after(() => first.close());
  const second = await startBundle({shared}); t.after(() => second.close());
  assert.equal(center(second).dataset.scene,'other-tab');
  assert.notEqual(center(second).innerHTML,center(blocked).innerHTML);
  assert.equal(second.ids.get('retry').disabled,false);
  assert.match(second.ids.get('status').textContent,/別のタブ/);
});

test('central CSS retains slow waiting and static reduced fallbacks while sharing faster hand keyframes', async () => {
  const css = await readFile('game/style.css','utf8');
  const sceneSource = await readFile('src/adapters/central-scene.ts','utf8');
  assert.doesNotMatch(sceneSource,/setTimeout|setInterval|requestAnimationFrame|Math\.random|Date\.|localStorage|indexedDB/);
  assert.match(css,/center-rock-cycle 4\.8s ease-in-out infinite/);
  assert.match(css,/center-scissors-cycle 4\.8s ease-in-out infinite/);
  assert.match(css,/center-paper-cycle 4\.8s ease-in-out infinite/);
  assert.match(css,/center-orbit 4\.8s linear infinite/);
  assert.doesNotMatch(css,/steps\(/);
  const durations = [...css.matchAll(/animation:([\w-]+)\s+([\d.]+)(ms|s)/g)].map(([,name,value,unit]) => ({name,ms:Number(value) * (unit === 's' ? 1000 : 1)}));
  assert.ok(durations.length >= 9); assert.ok(durations.every(({name,ms}) => ms === 300 ? /^center-(rock|scissors|paper)-cycle$/.test(name) : ms >= 1800));
  assert.match(css,/\.machine\[data-motion="reduced"\] \.center-scene \*\{animation:none!important\}/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/data-motion="reduced"[^}]+transform:translate\(var\(--trio-x\),var\(--trio-y\)\) scale\(\.72\)/);
  assert.match(css,/\.machine h1::before[\s\S]*inset: -10px -17px -12px/);
  assert.match(css,/\.machine \.face\s*\{[\s\S]*linear-gradient\(112deg, #f6ebc5, #ecdcad/);
  for (const selector of ['.machine::before,','.machine header::before,','.machine h1::before,','.machine .face::before']) {
    const rule = css.slice(css.indexOf(selector)).split('}')[0];
    assert.match(rule,/pointer-events: none/);
  }
  const centerRule=css.match(/\.state-indicator\{([^}]+)\}/)[1];
  assert.match(centerRule,/pointer-events:none/);
  assert.match(css,/\.state-controls\{[^}]*top:54%/);
  // The widened windows begin at radius123: keep recovery controls and focus inside.
  // 320px viewport source geometry: 198px display, 44px target plus 7px focus clearance.
  assert.ok(Math.hypot(22 + 7, 198 * .54 + 44 + 7 - 99) < 198 * (123 / 360));
});

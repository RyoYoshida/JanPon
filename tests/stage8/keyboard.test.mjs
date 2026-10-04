import test from 'node:test';
import assert from 'node:assert/strict';
import { startBundle } from '../helpers/browser-harness.mjs';
import { ENGINE } from '../../src/spec.ts';

// Runs the actual discovery-built HTML/bootstrap; API fakes are not real-browser or AT approval.
async function boot(t, options = {}) {
  const ui = await startBundle(options); t.after(() => ui.close());
  assert.ok(ui.ids.has('keyboard-help'), 'the packaged keyboard extension must actually be installed');
  return ui;
}
async function stake(ui) { ui.click('#coin-input'); await ui.flush(); assert.equal(ui.savedState.phase, 'choosing'); }

for (const key of ['Enter', ' ']) test(`T08-01 focused ${JSON.stringify(key)} inserts once and stays held across a complete round`, async t => {
  const ui = await boot(t); ui.focus('#coin-input');
  const down = ui.keyDown(key);
  assert.equal(down.defaultPrevented, true, 'cancel the native synthesized click');
  ui.keyDown(key, { repeat: false }); ui.click('#coin-input'); await ui.flush();
  assert.equal(ui.savedState.balance, 9); assert.equal(ui.savedState.roundNumber, 1);
  assert.equal(ui.savedState.phase, 'choosing'); assert.equal(ui.savedState.round.result, null, 'coin gesture cannot also choose a hand');
  ui.focus('[data-hand="paper"]'); ui.keyDown(key, { repeat: false }); await ui.flush();
  assert.equal(ui.savedState.round.result, null, 'a held key cannot transfer from the coin to a hand');
  ui.click('[data-hand="scissors"]'); await ui.drain();
  assert.equal(ui.savedState.phase, 'idle'); assert.equal(ui.savedState.balance, 9);
  const writes = ui.writes; ui.focus('#coin-input');
  assert.equal(ui.keyDown(key, { repeat: true }).defaultPrevented, true);
  assert.equal(ui.keyDown(key, { repeat: false }).defaultPrevented, true);
  await ui.flush(); assert.equal(ui.writes, writes); assert.equal(ui.savedState.roundNumber, 1);
  assert.equal(ui.keyUp(key).defaultPrevented, true, 'Space keyup must not synthesize a late stake');
  await ui.flush(); assert.equal(ui.writes, writes);
  ui.pressKey(key); await ui.flush();
  assert.equal(ui.savedState.phase, 'choosing'); assert.equal(ui.savedState.roundNumber, 2); assert.equal(ui.savedState.balance, 8);
});

for (const key of ['Enter', ' ']) test(`T08-01 focused hand ${JSON.stringify(key)} activates once after a fresh release`, async t => {
  const ui = await boot(t); await stake(ui); ui.focus('[data-hand="paper"]');
  ui.keyDown(key); ui.keyDown(key, { repeat: undefined }); await ui.flush();
  assert.equal(ui.savedState.round.result.player, 'paper'); assert.equal(ui.savedState.round.result.outcome, 'win');
  assert.equal(ui.savedState.revision, 2); ui.keyUp(key); await ui.drain();
  assert.equal(ui.savedState.roundNumber, 1); assert.equal(ui.savedState.phase, 'idle');
});

test('T08-01 physical-key holds survive changed key labels and IME Process events', async t => {
  const ui = await boot(t); ui.focus('#coin-input'); ui.keyDown('Process', { code: 'Enter', isComposing: true });
  ui.keyDown('Enter', { code: 'Enter', repeat: undefined }); await ui.flush();
  assert.equal(ui.savedState.roundNumber, 0, 'IME confirmation cannot turn a held Enter into a coin');
  ui.keyUp('Enter'); ui.document.body.focus(); ui.keyDown('r', { code: 'KeyR' }); await stake(ui);
  ui.keyDown('p', { code: 'KeyR', repeat: undefined }); await ui.flush(); assert.equal(ui.savedState.round.result, null);
  ui.keyUp('p', { code: 'KeyR' }); ui.pressKey('p', { code: 'KeyR' }); await ui.flush();
  assert.equal(ui.savedState.round.result.player, 'paper');
});

test('T08-01 body Enter/Space and documented hand shortcuts never insert a coin', async t => {
  const ui = await boot(t), before = ui.savedState, writes = ui.writes;
  ui.document.body.focus();
  for (const key of ['Enter', ' ', 'r', 's', 'p', 'c', '1']) ui.pressKey(key);
  await ui.flush(); assert.deepEqual(ui.savedState, before); assert.equal(ui.writes, writes);
  assert.equal(ui.ids.get('keyboard-help').className, 'sr-only');
  assert.match(ui.ids.get('keyboard-help').textContent, /Rでグー、Sでチョキ、Pでパー/);
  assert.equal(ui.machine.getAttribute('aria-describedby'), 'keyboard-help');
  assert.equal(ui.ids.get('coin-input').getAttribute('aria-keyshortcuts'), 'Enter Space');
  assert.equal(ui.hands.find(button => button.dataset.hand === 'rock').getAttribute('aria-keyshortcuts'), 'Enter Space R');
  assert.equal(ui.hands.find(button => button.dataset.hand === 'scissors').getAttribute('aria-keyshortcuts'), 'Enter Space S');
  assert.equal(ui.hands.find(button => button.dataset.hand === 'paper').getAttribute('aria-keyshortcuts'), 'Enter Space P');
});

for (const [key, hand, outcome] of [['r', 'rock', 'draw'], ['s', 'scissors', 'loss'], ['p', 'paper', 'win']]) {
  test(`T08-01 ${key.toUpperCase()} selects ${hand} through the bundled shared gate`, async t => {
    const ui = await boot(t); await stake(ui); ui.document.body.focus();
    assert.equal(ui.keyDown(key).defaultPrevented, true); ui.keyDown(key, { repeat: false }); await ui.flush();
    assert.equal(ui.savedState.round.result.player, hand); assert.equal(ui.savedState.round.result.outcome, outcome);
    await ui.drain(); const before = ui.savedState, writes = ui.writes;
    ui.keyDown(key, { repeat: false }); await ui.flush();
    assert.deepEqual(ui.savedState, before); assert.equal(ui.writes, writes, 'a held hand shortcut cannot act again after rendering');
    ui.keyUp(key);
    if (outcome === 'draw') {
      ui.pressKey(key); await ui.flush();
      assert.equal(ui.savedState.revision, before.revision + 1, 'keyup permits the next legitimate free hand');
      assert.equal(ui.savedState.balance, 9); assert.equal(ui.savedState.roundNumber, 1);
    }
  });
}

test('T08-01 pointer and keyboard duplicates share a synchronous choice gate', async t => {
  const ui = await boot(t); ui.click('#coin-input'); ui.keyDown('Enter'); await ui.flush(); ui.keyUp('Enter');
  assert.equal(ui.savedState.balance, 9); assert.equal(ui.savedState.roundNumber, 1); assert.equal(ui.savedState.round.result, null);
  ui.click('[data-hand="paper"]'); ui.keyDown('s'); await ui.flush(); ui.keyUp('s');
  assert.equal(ui.savedState.round.result.player, 'paper'); assert.equal(ui.savedState.round.result.outcome, 'win');
  assert.equal(ui.savedState.revision, 2, 'only the first hand gesture commits');
  await ui.drain(); await stake(ui);
  ui.document.body.focus(); ui.keyDown('s'); ui.click('[data-hand="paper"]'); await ui.flush(); ui.keyUp('s');
  assert.equal(ui.savedState.round.result.player, 'scissors', 'keyboard wins the same gate when it arrives first');
});

test('T08-01 shortcut held while unavailable cannot become a hand after a pointer stake', async t => {
  const ui = await boot(t); ui.document.body.focus(); ui.keyDown('p'); await stake(ui);
  ui.keyDown('p', { repeat: false }); await ui.flush(); assert.equal(ui.savedState.round.result, null);
  ui.keyUp('p'); ui.pressKey('p'); await ui.flush(); assert.equal(ui.savedState.round.result.player, 'paper');
});

test('T08-01 unavailable legal choices remain rejected even if DOM controls are tampered enabled', async t => {
  const ui = await boot(t), original = ui.savedState;
  for (const selector of ['[data-hand="rock"]', '#restart']) {
    const button = ui.document.querySelector(selector); button.disabled = false; button.hidden = false; button.focus();
    ui.pressKey('Enter'); await ui.flush(); assert.deepEqual(ui.savedState, original);
  }
  await stake(ui); const choosing = ui.savedState;
  ui.ids.get('coin-input').disabled = false; ui.focus('#coin-input'); ui.pressKey(' '); await ui.flush();
  assert.deepEqual(ui.savedState, choosing, 'the display gate, not just disabled styling, enforces choices');
  ui.document.body.focus(); ui.pressKey('s'); await ui.flush();
  assert.equal(ui.savedState.phase, 'result'); const result = ui.savedState, writes = ui.writes;
  ui.pressKey('p'); ui.pressKey('r'); await ui.flush(); assert.deepEqual(ui.savedState, result); assert.equal(ui.writes, writes);
});

test('T08-01 composition, modifiers and prevented events cannot bypass native button guards', async t => {
  const ui = await boot(t), original = ui.savedState; ui.focus('#coin-input');
  for (const flag of ['isComposing', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'defaultPrevented']) {
    for (const key of ['Enter', ' ']) { ui.pressKey(key, { [flag]: true }); await ui.flush(); assert.deepEqual(ui.savedState, original, `${flag}/${key}`); }
  }
  ui.dispatch(ui.document, 'compositionstart'); ui.pressKey('Enter'); await ui.flush(); assert.deepEqual(ui.savedState, original);
  ui.dispatch(ui.document, 'compositionend'); ui.pressKey('Enter'); await ui.flush(); assert.equal(ui.savedState.phase, 'choosing');
  const choosing = ui.savedState; ui.document.body.focus();
  for (const flag of ['isComposing', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'defaultPrevented']) {
    ui.pressKey('p', { [flag]: true }); await ui.flush(); assert.deepEqual(ui.savedState, choosing, flag);
  }
  ui.dispatch(ui.document, 'compositionstart'); ui.pressKey('r'); ui.dispatch(ui.document, 'compositionend');
  await ui.flush(); assert.deepEqual(ui.savedState, choosing);
});

test('T08-01 editable input contexts retain text shortcuts without selecting a hand', async t => {
  const ui = await boot(t); await stake(ui); const choosing = ui.savedState;
  for (const tag of ['input', 'textarea', 'select']) {
    const input = ui.document.createElement(tag); ui.document.body.append(input); input.focus();
    const event = ui.keyDown('p'); ui.keyUp('p'); await ui.flush();
    assert.equal(event.defaultPrevented, false); assert.deepEqual(ui.savedState, choosing); input.remove();
  }
  for (const attribute of ['contenteditable', 'role']) {
    const editable = ui.document.createElement('div'); editable.setAttribute(attribute, attribute === 'role' ? 'textbox' : 'true');
    const child = ui.document.createElement('span'); editable.append(child); ui.document.body.append(editable); child.focus();
    const event = ui.keyDown('s'); ui.keyUp('s'); await ui.flush();
    assert.equal(event.defaultPrevented, false); assert.deepEqual(ui.savedState, choosing); editable.remove();
  }
  ui.document.body.focus(); ui.pressKey('p'); await ui.flush(); assert.equal(ui.savedState.round.result.player, 'paper');
});

for (const key of ['Enter', ' ']) test(`T08-01 ${JSON.stringify(key)} held across blur/visibility stays closed until release`, async t => {
  const ui = await boot(t); ui.focus('#coin-input'); ui.keyDown(key); await ui.flush();
  ui.dispatchWindow('blur'); ui.document.visibilityState = 'hidden'; ui.document.hidden = true; ui.dispatch(ui.document, 'visibilitychange');
  ui.click('[data-hand="scissors"]'); await ui.drain(); assert.equal(ui.savedState.phase, 'idle');
  ui.document.visibilityState = 'visible'; ui.document.hidden = false; ui.dispatch(ui.document, 'visibilitychange'); ui.dispatchWindow('focus');
  const before = ui.savedState; ui.focus('#coin-input'); ui.keyDown(key, { repeat: false }); await ui.flush(); assert.deepEqual(ui.savedState, before);
  ui.keyUp(key); await ui.flush(); assert.deepEqual(ui.savedState, before, 'release alone does not insert');
  ui.pressKey(key); await ui.flush(); assert.equal(ui.savedState.roundNumber, 2); assert.equal(ui.savedState.balance, 8);
});

test('T08-01 focused settings and retry work after restore failure and never insert', async t => {
  const damaged = { schema: 'corrupt-save', balance: 10 }, ui = await boot(t, { savedState: damaged });
  assert.equal(ui.machine.dataset.phase, 'stopped'); assert.equal(ui.writes, 0);
  for (const selector of ['#audio-toggle', '#motion-toggle']) {
    const button = ui.focus(selector); assert.equal(button.disabled, false);
    const before = button.getAttribute('aria-pressed'); ui.pressKey('Enter'); await ui.flush();
    assert.notEqual(button.getAttribute('aria-pressed'), before, `${selector} remains keyboard operable`);
    ui.pressKey(' '); await ui.flush(); assert.equal(button.getAttribute('aria-pressed'), before);
    assert.equal(ui.reloads, 0); assert.equal(ui.writes, 0); assert.deepEqual(ui.savedState, damaged);
  }
  ui.focus('#retry'); ui.keyDown(' '); ui.keyDown(' ', { repeat: false }); ui.keyUp(' '); await ui.flush();
  assert.equal(ui.reloads, 1); assert.equal(ui.writes, 0); assert.deepEqual(ui.savedState, damaged);
});

for (const key of ['Enter', ' ']) test(`T08-01 explicit focused restart ${JSON.stringify(key)} starts one new game and never also stakes`, async t => {
  const ui = await boot(t, { savedState: {
    schema: ENGINE.schema, revision: 3, phase: 'game-over', balance: 0, roundNumber: 1, rngState: 48271, updatedAt: 0,
    round: { number: 1, balanceBefore: 1, opponent: 'rock', result: { player: 'scissors', opponent: 'rock', outcome: 'loss', payout: 0 } },
  } });
  ui.focus('#restart'); ui.keyDown(key); ui.keyDown(key, { repeat: false }); await ui.flush();
  assert.equal(ui.savedState.phase, 'idle'); assert.equal(ui.savedState.balance, 10); assert.equal(ui.savedState.roundNumber, 0); assert.equal(ui.savedState.revision, 4);
  ui.focus('#coin-input'); ui.keyDown(key, { repeat: false }); await ui.flush(); assert.equal(ui.savedState.roundNumber, 0);
  ui.keyUp(key); ui.pressKey(key); await ui.flush(); assert.equal(ui.savedState.roundNumber, 1); assert.equal(ui.savedState.balance, 9);
});

test('T08-01 pagehide disposes keyboard listeners and generated accessible help', async t => {
  const ui = await boot(t); const before = ui.savedState; await ui.close();
  assert.equal(ui.ids.has('keyboard-help'), false); assert.equal(ui.machine.getAttribute('aria-describedby'), null);
  assert.equal(ui.ids.get('coin-input').getAttribute('aria-keyshortcuts'), null);
  assert.equal(ui.document.listeners.get('keyup').length, 0); assert.equal(ui.document.listeners.get('compositionstart').length, 0);
  ui.document.body.focus(); ui.pressKey('p'); await ui.flush(); assert.deepEqual(ui.savedState, before);
});

test('T08-01 Document-targeted keys are safe and still share the held-key and choice guards', async t => {
  const ui = await boot(t), original = ui.savedState;
  assert.doesNotThrow(() => {
    for (const key of ['Enter', ' ', 'r', 's', 'p']) {
      ui.dispatch(ui.document, 'keydown', { key }); ui.dispatch(ui.document, 'keyup', { key });
    }
  });
  await ui.flush(); assert.deepEqual(ui.savedState, original, 'Document-targeted keys never create an implicit stake');
  await stake(ui); const revision = ui.savedState.revision;
  assert.equal(ui.dispatch(ui.document, 'keydown', { key: 'r' }).defaultPrevented, true);
  ui.dispatch(ui.document, 'keydown', { key: 'r', repeat: undefined }); await ui.drain();
  assert.equal(ui.savedState.revision, revision + 1); assert.equal(ui.savedState.round.result.outcome, 'draw');
  const draw = ui.savedState; ui.dispatch(ui.document, 'keydown', { key: 'r', repeat: undefined }); await ui.flush();
  assert.deepEqual(ui.savedState, draw, 'a direct Document event cannot replay a held hand after rendering');
  ui.dispatch(ui.document, 'keyup', { key: 'r' }); ui.dispatch(ui.document, 'keydown', { key: 's' });
  ui.dispatch(ui.document, 'keyup', { key: 's' }); await ui.flush();
  assert.equal(ui.savedState.revision, draw.revision + 1); assert.equal(ui.savedState.round.result.player, 'scissors');
  assert.equal(ui.savedState.roundNumber, 1); assert.equal(ui.savedState.balance, 9);
});

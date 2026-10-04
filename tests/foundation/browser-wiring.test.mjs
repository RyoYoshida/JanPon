import test from 'node:test';
import assert from 'node:assert/strict';
import { startBundle, createSharedState } from '../helpers/browser-harness.mjs';

// Executes dist/JanPon.html's actual bootstrap and discovered registrations.
// API-contract fake coverage only: no browser is launched and no sound is heard.
test('packaged bootstrap completes the deterministic 10 → 9 → 13 first round', async () => {
  const ui = await startBundle();
  try {
    assert.match(ui.scope, /real-browser QA NOT_RUN/);
    assert.equal(ui.document.defaultView, ui.window);
    assert.equal(ui.machine.dataset.phase, 'idle');
    assert.equal(ui.ids.get('balance').textContent, '10');
    assert.equal(ui.writes, 1);
    assert.equal(ui.hands.length, 3);
    assert.equal(ui.lamps.length, 100);
    ui.hands[2].click(); await ui.flush();
    assert.equal(ui.writes, 1, 'a hand before the stake cannot alter storage');
    ui.ids.get('coin-input').click(); ui.ids.get('coin-input').click();
    await ui.flush();
    assert.equal(ui.machine.dataset.phase, 'choosing');
    assert.equal(ui.ids.get('balance').textContent, '9');
    assert.equal(ui.writes, 2, 'the duplicate stake is prevented before async commit');
    ui.hands[2].click(); await ui.flush();
    assert.equal(ui.machine.dataset.phase, 'result');
    assert.equal(ui.savedState.round.result.payout, 4);
    assert.equal(ui.ids.get('balance').textContent, '9');
    assert.equal(ui.writes, 3);
    assert.equal(ui.elapsed, 0, 'microtask flushing never consumes animation timers');
    assert.equal(ui.timers.size, 1);
    await ui.drain();
    assert.equal(ui.machine.dataset.phase, 'idle');
    assert.equal(ui.ids.get('balance').textContent, '13');
    assert.equal(ui.savedState.balance, 13);
    assert.equal(ui.writes, 4);
    assert.equal(ui.elapsed, 1800);
    assert.equal(ui.timers.size, 0);
  } finally { await ui.close(); }
});

test('packaged ownership, reload and failed write preserve committed balance without double award', async () => {
  const shared = createSharedState();
  const tabs = [];
  try {
    let ui = await startBundle({ shared }); tabs.push(ui);
    ui.ids.get('coin-input').click(); await ui.flush();
    ui.hands[2].click(); await ui.drain();
    const settled = ui.savedState;
    const competing = await startBundle({ shared }); tabs.push(competing);
    assert.equal(competing.machine.dataset.phase, 'other-tab');
    assert.equal(competing.writes, 4);
    await ui.close();
    ui = await startBundle({ shared }); tabs.push(ui);
    assert.deepEqual(ui.savedState, settled);
    assert.equal(ui.ids.get('balance').textContent, '13');
    assert.equal(ui.writes, 4);
    ui.abortNextWrite(); ui.ids.get('coin-input').click(); await ui.flush();
    assert.equal(ui.machine.dataset.phase, 'stopped');
    assert.equal(ui.ids.get('balance').textContent, '13');
    assert.equal(ui.ids.get('retry').hidden, false);
    assert.deepEqual(ui.savedState, settled);
    assert.equal(shared.writeLog.at(-1).committed, false);
    assert.equal(shared.committedWrites, 4);
    ui.ids.get('retry').click();
    assert.equal(ui.reloads, 1);
    await ui.close();
    ui = await startBundle({ shared }); tabs.push(ui);
    assert.equal(ui.machine.dataset.phase, 'idle');
    assert.equal(ui.ids.get('balance').textContent, '13');
    assert.equal(ui.writes, 5, 'recovery does not retry or settle an aborted stake');
    ui.pageshow({ persisted: true });
    assert.equal(ui.reloads, 1);
  } finally { for (const tab of tabs) await tab.close(); }
  assert.equal(shared.leases.size, 0);
});

test('harness dynamic controls support capture, bubbling, default cancellation and removal', async () => {
  const ui = await startBundle({ runBundle: false });
  const control = ui.document.createElement('button');
  control.id = 'audio-toggle'; control.type = 'button'; control.className = 'tool';
  control.setAttribute('aria-pressed', 'false');
  ui.document.querySelector('.state-controls').append(control);
  assert.equal(ui.ids.get('audio-toggle'), control);
  assert.equal(ui.document.querySelector('.state-controls #audio-toggle'), control);
  assert.equal(control.closest('.machine'), ui.machine);
  const order = [];
  ui.window.addEventListener('click', () => order.push('window capture'), true);
  ui.document.addEventListener('click', () => order.push('document capture'), { capture: true });
  control.addEventListener('click', () => order.push('target'));
  ui.document.addEventListener('click', () => order.push('document bubble'));
  ui.window.addEventListener('click', () => order.push('window bubble'));
  control.click();
  assert.deepEqual(order, ['window capture', 'document capture', 'target', 'document bubble', 'window bubble']);
  order.length = 0;
  const block = event => { event.preventDefault(); event.stopPropagation(); };
  ui.document.addEventListener('keydown', block, { capture: true });
  ui.focus(control);
  const canceled = ui.pressKey('Enter');
  assert.equal(canceled.down.defaultPrevented, true);
  assert.deepEqual(order, [], 'canceling keydown suppresses the native button click');
  ui.document.removeEventListener('keydown', block, true);
  ui.pressKey('Enter');
  assert.equal(order.filter(value => value === 'target').length, 1);
  control.remove();
  assert.equal(ui.document.getElementById('audio-toggle'), null);
  assert.equal(ui.ids.has('audio-toggle'), false);
  assert.equal(control.isConnected, false);
});

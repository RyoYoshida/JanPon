import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startBundle } from '../helpers/browser-harness.mjs';

// Post-trial UI regression tests, not part of the historical stage8 add-only proof.
// The packaged DOM and CSS source are inspected; pixel/device QA remains NOT_RUN.
test('outer settings form one text-free group after the cabinet, outside every play target', async t => {
  const ui = await startBundle(); t.after(() => ui.close());
  const shell = ui.document.querySelector('.game-shell');
  const groups = ui.document.querySelectorAll('.settings-controls');
  assert.equal(groups.length, 1);
  const group = groups[0];
  assert.equal(group.parentElement, shell);
  assert.deepEqual(shell.children, [ui.machine, group]);
  assert.equal(group.getAttribute('role'), 'group');
  assert.equal(group.getAttribute('aria-label'), '音と動きの設定');
  assert.equal(group.textContent, '');
  assert.equal(group.children.length, 2);
  for (const id of ['audio-toggle', 'motion-toggle']) {
    const button = ui.ids.get(id);
    assert.equal(button.parentElement, group);
    assert.equal(button.closest('.machine, .face, .controls, #coin-input'), null);
    assert.equal(button.localName, 'button'); assert.equal(button.type, 'button');
    assert.equal(button.getAttribute('aria-keyshortcuts'), 'Enter Space');
    assert.ok(button.getAttribute('aria-label'));
    assert.equal(button.getAttribute('aria-pressed'), 'false');
  }
  assert.ok(ui.ids.get('state-symbol').closest('.face .state-controls'));
  assert.match(ui.ids.get('state-symbol').innerHTML, /<svg/);
});

test('outer settings use responsive normal flow with 44px controls and cabinet separation', async () => {
  const css = await readFile('game/style.css', 'utf8');
  const group = css.match(/\.settings-controls\{([^}]+)\}/)?.[1];
  assert.ok(group); assert.match(group, /display:flex/); assert.match(group, /flex-wrap:wrap/);
  assert.match(group, /margin-top:28px/); assert.match(group, /gap:12px/);
  assert.doesNotMatch(group, /position:|transform:|margin-top:-/);
  assert.match(css, /\.game-shell\{width:min\(100%,430px\)\}/);
  assert.match(css, /@media\(max-height:650px\) and \(min-width:500px\)\{body\{padding:20px\}\.game-shell\{width:355px\}/);
  assert.match(css, /\.settings-controls \.tool\{width:44px;height:44px;min-width:44px\}/);
});

for (const key of ['Enter', ' ']) test(`outer settings preserve single activation for held ${JSON.stringify(key)}`, async t => {
  const ui = await startBundle(); t.after(() => ui.close());
  const before = ui.savedState, writes = ui.writes;
  for (const selector of ['#audio-toggle', '#motion-toggle']) {
    const button = ui.focus(selector);
    assert.equal(ui.keyDown(key).defaultPrevented, true);
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    for (const repeat of [true, false, undefined]) {
      assert.equal(ui.keyDown(key, { repeat }).defaultPrevented, true);
      assert.equal(button.getAttribute('aria-pressed'), 'true');
    }
    ui.focus('#coin-input'); ui.keyDown(key, { repeat: false }); await ui.flush();
    assert.deepEqual(ui.savedState, before, 'holding a setting key cannot become a stake');
    ui.focus(selector); assert.equal(ui.keyUp(key).defaultPrevented, true);
    assert.equal(button.getAttribute('aria-pressed'), 'true', 'release cannot cause a second toggle');
    ui.pressKey(key); assert.equal(button.getAttribute('aria-pressed'), 'false');
  }
  await ui.flush(); assert.deepEqual(ui.savedState, before); assert.equal(ui.writes, writes);
});

test('outer settings preserve modifier and composition guards without claiming unrelated page buttons', async t => {
  const ui = await startBundle(); t.after(() => ui.close());
  const before = ui.savedState;
  for (const selector of ['#audio-toggle', '#motion-toggle']) {
    const button = ui.focus(selector);
    for (const key of ['Enter', ' ']) {
      for (const flag of ['isComposing', 'ctrlKey', 'altKey', 'metaKey', 'shiftKey', 'defaultPrevented']) {
        ui.pressKey(key, { [flag]: true });
        assert.equal(button.getAttribute('aria-pressed'), 'false', `${selector}/${key}/${flag}`);
      }
      ui.dispatch(ui.document, 'compositionstart'); ui.pressKey(key);
      ui.dispatch(ui.document, 'compositionend');
      assert.equal(button.getAttribute('aria-pressed'), 'false');
    }
  }
  const external = ui.document.createElement('button'); external.type = 'button';
  ui.document.body.append(external); external.focus();
  let clicks = 0; external.addEventListener('click', () => clicks++);
  for (const key of ['Enter', ' ']) assert.equal(ui.pressKey(key).down.defaultPrevented, false);
  assert.equal(clicks, 2);
  await ui.flush(); assert.deepEqual(ui.savedState, before);
});

test('lower-left status and non-destructive retry remain visible when saved data cannot be restored', async t => {
  const damaged = { schema: 'corrupt-save', balance: 10 };
  const ui = await startBundle({ savedState: damaged }); t.after(() => ui.close());
  assert.equal(ui.machine.dataset.phase, 'stopped');
  assert.ok(ui.ids.get('state-symbol').closest('.face .state-controls'));
  assert.match(ui.ids.get('state-symbol').innerHTML, /<svg/);
  assert.match(ui.ids.get('state-indicator').innerHTML, /<svg/);
  assert.match(ui.ids.get('status').textContent, /保存は消しません/);
  assert.equal(ui.ids.get('retry').hidden, false); assert.equal(ui.ids.get('retry').disabled, false);
  assert.deepEqual(ui.savedState, damaged); assert.equal(ui.writes, 0);
});

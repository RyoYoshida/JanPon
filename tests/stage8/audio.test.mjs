import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { EFFECTS } from '../../src/spec.ts';
import { startBundle } from '../helpers/browser-harness.mjs';

const trusted = { isTrusted: true };
const pitches = ui => ui.audio.starts.map(({ oscillator }) => oscillator.frequency.value);
const winHand = { rock: 'paper', scissors: 'rock', paper: 'scissors' };
const lossHand = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
async function scenario(ui, activation = trusted) {
  ui.click('#coin-input', activation); await ui.flush();
  assert.equal(ui.savedState.balance, 9); assert.equal(ui.savedState.phase, 'choosing');
  for (let draw = 0; draw < 2; draw++) {
    ui.click(`[data-hand="${ui.savedState.round.opponent}"]`, activation); await ui.flush();
    assert.equal(ui.savedState.round.result.outcome, 'draw');
    assert.equal(ui.savedState.balance, 9); assert.equal(ui.savedState.roundNumber, 1);
    await ui.drain();
  }
  ui.click(`[data-hand="${winHand[ui.savedState.round.opponent]}"]`, activation); await ui.flush();
  assert.equal(ui.savedState.round.result.outcome, 'win'); assert.equal(ui.savedState.round.result.payout, 1);
  assert.equal(ui.savedState.balance, 9); await ui.drain();
  assert.equal(ui.savedState.phase, 'idle'); assert.equal(ui.savedState.balance, 10);
  ui.click('#coin-input', activation); await ui.flush();
  ui.click(`[data-hand="${lossHand[ui.savedState.round.opponent]}"]`, activation); await ui.flush();
  assert.equal(ui.savedState.round.result.outcome, 'loss'); await ui.drain();
  assert.equal(ui.savedState.phase, 'idle'); assert.equal(ui.savedState.balance, 9);
  assert.equal(ui.savedState.roundNumber, 2); assert.equal(ui.savedState.revision, 8);
  assert.equal(ui.writes, 9);
  return structuredClone(ui.writeLog);
}

test('T08-01 A4 actual bundle preserves every saved outcome/accounting across audio refusal, mute and pending resume', async () => {
  let baseline;
  const unhandled = [], collect = error => unhandled.push(error);
  process.on('unhandledRejection', collect);
  try {
    for (const [name, audio] of [
      ['allowed', {}], ['rejected', { resume: 'reject' }], ['muted', {}],
      ['unavailable', { available: false }], ['pending', { resume: 'pending' }],
      ['constructor failure', { failConstructor: true }], ['oscillator failure', { failOscillator: true }],
      ['gain failure', { failGain: true }], ['start failure', { failStart: true }],
      ['stop failure', { failStop: true }], ['untrusted', {}],
    ]) {
      const ui = await startBundle({ audio });
      try {
        assert.equal(ui.audio.constructorCalls, 0, 'loading does not request autoplay');
        if (name === 'muted') ui.click('#audio-toggle', trusted);
        const saved = await scenario(ui, name === 'untrusted' ? { isTrusted: false } : trusted);
        if (baseline) assert.deepEqual(saved, baseline, name); else baseline = saved;
        if (name === 'allowed') {
          assert.deepEqual(pitches(ui), ['start', 'draw', 'draw', 'win', 'payout', 'start', 'loss'].map(sound => EFFECTS.frequencies[sound]));
          for (const { oscillator, when } of ui.audio.starts) {
            assert.equal(oscillator.type, 'sine');
            assert.equal(oscillator.stops[0], when + EFFECTS.audioDurationSeconds);
          }
          for (const { gain } of ui.audio.gains) {
            assert.equal(gain.calls[0][1], EFFECTS.audioGain);
            assert.equal(gain.calls[1][1], EFFECTS.audioFloor);
          }
        } else if (name !== 'stop failure') assert.equal(ui.audio.starts.length, 0, name);
        if (name === 'pending') {
          assert.ok(ui.audio.pendingResumes.length > 0);
          ui.audio.resolveResume(); await ui.flush();
          assert.equal(ui.audio.starts.length, 0, 'late permission never replays discarded outcomes');
        }
      } finally { await ui.close(); }
    }
    await setImmediate(); assert.deepEqual(unhandled, []);
  } finally { process.off('unhandledRejection', collect); }
});

test('T08-01 A4 icon-only mute stops active tones immediately and never requests a game action', async () => {
  const ui = await startBundle();
  try {
    const button = ui.ids.get('audio-toggle');
    assert.equal(button.type, 'button'); assert.ok(button.classList.contains('tool'));
    assert.equal(button.parentElement.className, 'settings-controls');
    assert.equal(button.getAttribute('aria-label'), 'ミュート');
    assert.equal(button.getAttribute('aria-keyshortcuts'), 'Enter Space');
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.equal(button.textContent, ''); assert.equal(button.querySelector('svg').getAttribute('aria-hidden'), 'true');
    const initial = ui.savedState;
    ui.click(button, trusted); ui.click(button, trusted); await ui.flush();
    assert.deepEqual(ui.savedState, initial); assert.equal(ui.writes, 1);
    assert.equal(ui.audio.constructorCalls, 0, 'settings alone do not request autoplay');
    ui.click('#coin-input', trusted); await ui.flush();
    assert.deepEqual(pitches(ui), [EFFECTS.frequencies.start]);
    const saved = ui.savedState, writes = ui.writes;
    ui.click(button, trusted);
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.ok(ui.audio.oscillators.every(oscillator => oscillator.stops.at(-1) === 0 && oscillator.disconnected));
    assert.ok(ui.audio.gains.every(gain => gain.disconnected));
    ui.click(button, trusted); await ui.flush();
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.deepEqual(pitches(ui), [EFFECTS.frequencies.start], 'unmute does not replay the stopped tone');
    assert.deepEqual(ui.savedState, saved); assert.equal(ui.writes, writes);
  } finally { await ui.close(); }
});

test('T08-01 A4 only trusted pointer, keyboard or click activation can initialize audio', async () => {
  for (const type of ['pointerdown', 'keydown', 'click']) {
    const ui = await startBundle();
    try {
      ui.dispatch(ui.machine, type, { key: 'a' }); await ui.flush();
      assert.equal(ui.audio.constructorCalls, 0);
      ui.dispatch(ui.machine, type, { key: 'a', ...trusted }); await ui.flush();
      assert.equal(ui.audio.constructorCalls, 1); assert.equal(ui.audio.resumeCalls, 1);
      assert.equal(ui.audio.starts.length, 0, 'activation alone is silent');
      ui.click('#coin-input', trusted); await ui.flush();
      assert.deepEqual(pitches(ui), [EFFECTS.frequencies.start]);
    } finally { await ui.close(); }
  }
});

test('T08-01 A4 mute/unmute invalidates pending playback and late resume rejection stays harmless', async () => {
  for (const resolution of ['resolveResume', 'rejectResume']) {
    const ui = await startBundle({ audio: { resume: 'pending' } });
    try {
      ui.click('#coin-input', trusted); await ui.flush();
      assert.equal(ui.savedState.phase, 'choosing'); assert.equal(ui.savedState.balance, 9);
      assert.equal(ui.audio.pendingResumes.length, 1); assert.equal(ui.audio.starts.length, 0);
      ui.click('#audio-toggle', trusted); ui.audio[resolution](); await ui.flush();
      ui.click('#audio-toggle', trusted); await ui.flush();
      assert.equal(ui.audio.starts.length, 0, 'neither resolution nor unmute replays the coin sound');
      ui.audio.settings.resume = 'resolve';
      ui.click(`[data-hand="${lossHand[ui.savedState.round.opponent]}"]`, trusted); await ui.flush();
      assert.deepEqual(pitches(ui), [EFFECTS.frequencies.loss], 'a later current event can play after fresh permission');
      await ui.drain(); assert.equal(ui.savedState.balance, 9); assert.equal(ui.savedState.revision, 3);
    } finally { await ui.close(); }
  }
  await setImmediate();
});

test('T08-01 A4 pagehide stops voices, closes context and removes activation/toggle listeners exactly once', async () => {
  for (const resume of ['resolve', 'pending']) {
    const ui = await startBundle({ audio: { resume } });
    ui.click('#coin-input', trusted); await ui.flush();
    const button = ui.ids.get('audio-toggle');
    assert.ok(button.listeners.get('click').length > 0);
    await ui.close(); await ui.close();
    assert.equal(ui.audio.closeCalls, 1); assert.equal(ui.audio.contexts[0].state, 'closed');
    assert.equal(ui.ids.has('audio-toggle'), false); assert.equal(button.listeners.get('click').length, 0);
    for (const name of ['pointerdown', 'keydown', 'click']) assert.equal(ui.document.listeners.get(name)?.length ?? 0, 0);
    assert.ok(ui.audio.oscillators.every(oscillator => oscillator.disconnected));
    assert.ok(ui.audio.gains.every(gain => gain.disconnected));
    const count = ui.audio.starts.length;
    ui.audio.resolveResume(); ui.dispatch(ui.machine, 'pointerdown', trusted); await ui.flush();
    assert.equal(ui.audio.constructorCalls, 1); assert.equal(ui.audio.starts.length, count);
  }
});

test('T08-01 A4 ended nodes are disconnected and context close refusal never escapes pagehide', async () => {
  for (const close of ['reject', 'throw']) {
    const ui = await startBundle();
    ui.click('#coin-input', trusted); await ui.flush();
    const oscillator = ui.audio.oscillators[0], gain = ui.audio.gains[0];
    oscillator.end();
    assert.equal(oscillator.disconnected, true); assert.equal(gain.disconnected, true);
    const stopCount = oscillator.stops.length;
    ui.click('#audio-toggle', trusted);
    assert.equal(oscillator.stops.length, stopCount, 'ended voices are no longer active');
    ui.audio.contexts[0].close = () => {
      if (close === 'throw') throw new Error('close denied');
      return Promise.reject(new Error('close denied'));
    };
    await ui.close(); assert.equal(ui.ids.has('audio-toggle'), false);
  }
  await setImmediate();
});

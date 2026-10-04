import { EFFECTS, SPEC } from '../spec.ts';
import type { GameView, Output } from '../core/game-contracts.ts';
import type { BrowserHost } from './browser-contracts.ts';
import { settingsControls } from './settings-controls.ts';
import { listenPresentationCue } from './presentation-cues.ts';

type Sound = keyof typeof EFFECTS.frequencies;
interface Tone { oscillator: OscillatorNode; gain: GainNode }
type AudioWindow = Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };

/** Optional committed-state effects; no effect promise enters the application path. */
export function createAudioOutput(host: BrowserHost): Output & { dispose(): void } {
  let context: AudioContext | null = null, previous: GameView | null = null;
  let muted = false, disposed = false, resuming = false;
  const tones = new Set<Tone>();
  const button = host.document.createElement('button');
  button.id = 'audio-toggle'; button.className = 'tool'; button.type = 'button';
  button.setAttribute('aria-label', 'ミュート'); button.setAttribute('aria-keyshortcuts', 'Enter Space');
  function show(): void {
    button.setAttribute('aria-pressed', String(muted));
    const detail = muted ? 'm22 11 8 10m0-10-8 10' : 'M22 11q8 5 0 10';
    button.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 12h6l8-7v22l-8-7H3Z${detail}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  show(); settingsControls(host.document).append(button);
  function disconnect(tone: Tone): void {
    tones.delete(tone); tone.oscillator.onended = null;
    try { tone.oscillator.disconnect(); } catch { /* Already disconnected. */ }
    try { tone.gain.disconnect(); } catch { /* Already disconnected. */ }
  }
  function silence(): void {
    for (const tone of tones) {
      tone.oscillator.onended = null;
      try { tone.oscillator.stop(); } catch { /* A finished voice is already silent. */ }
      disconnect(tone);
    }
  }
  function activate(event: Event): void {
    if (!event.isTrusted || muted || disposed || (event.target as Element | null)?.closest?.('#audio-toggle')) return;
    try {
      const Audio = (host.window as AudioWindow).AudioContext ?? (host.window as AudioWindow).webkitAudioContext;
      if (!Audio) return;
      context ??= new Audio();
      if (context.state === 'running' || context.state === 'closed' || resuming) return;
      resuming = true;
      // Pending/rejected autoplay is optional: never await it and never queue a tone.
      void context.resume().then(() => { resuming = false; }, () => { resuming = false; });
    } catch { resuming = false; }
  }
  function play(sound: Sound): void {
    if (muted || disposed || host.document.hidden || !host.document.querySelector('.machine')?.isConnected || !context || context.state !== 'running') return;
    silence();
    let oscillator: OscillatorNode | null = null, gain: GainNode | null = null, tone: Tone | null = null;
    try {
      oscillator = context.createOscillator(); gain = context.createGain();
      tone = { oscillator, gain }; const active = tone, start = context.currentTime;
      const end = start + EFFECTS.audioDurationSeconds;
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(EFFECTS.frequencies[sound], start);
      gain.gain.setValueAtTime(EFFECTS.audioGain, start);
      gain.gain.exponentialRampToValueAtTime(EFFECTS.audioFloor, end);
      oscillator.connect(gain); gain.connect(context.destination); tones.add(tone);
      oscillator.onended = () => disconnect(active);
      oscillator.start(start); oscillator.stop(end);
    } catch {
      if (oscillator) {
        try { oscillator.stop(); } catch { /* A refused oscillator may not have started. */ }
        if (tone) disconnect(tone);
        else try { oscillator.disconnect(); } catch { /* Audio refusal is harmless. */ }
      }
    }
  }
  function toggle(event: Event): void {
    event.stopPropagation(); muted = !muted;
    if (muted) silence();
    show();
  }
  const removeCue = listenPresentationCue(host.document, () => play('draw'));
  function visibilityChanged(): void { if (host.document.hidden) silence(); }
  host.document.addEventListener('visibilitychange', visibilityChanged);
  const activations = ['pointerdown', 'keydown', 'click'];
  for (const name of activations) host.document.addEventListener(name, activate, { capture: true });
  button.addEventListener('click', toggle);
  function dispose(): void {
    if (disposed) return;
    disposed = true; silence(); removeCue();
    host.document.removeEventListener('visibilitychange', visibilityChanged);
    for (const name of activations) host.document.removeEventListener(name, activate, { capture: true });
    button.removeEventListener('click', toggle); button.remove();
    host.window.removeEventListener('pagehide', dispose);
    try { void context?.close().catch(() => {}); } catch { /* Closing optional audio cannot block departure. */ }
    context = null; previous = null;
  }
  host.window.addEventListener('pagehide', dispose);
  return {
    id: 'audio', priority: SPEC.defaultPriority, dispose,
    emit(event): void {
      const view = event.view, before = previous; previous = view;
      if (view.phase === 'choosing') {
        if (view.result?.outcome === 'draw') silence(); // The shared hold completion supplies the restart cue.
        else if (!view.result) play('start');
      } else if (view.phase === 'result' && view.result) play(view.result.outcome);
      else if (view.phase === 'idle' && before?.phase === 'result' && before.result?.outcome === 'win') play('payout');
    },
  };
}

export const extension = { axis: 'A4', id: 'audio', implementation: createAudioOutput, taskIds: ['T08-01'] };

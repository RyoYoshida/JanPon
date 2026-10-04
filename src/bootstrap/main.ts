import { ENGINE } from '../spec.ts';
import { select, collect, checkManifest } from '../core/registry.ts';
import type { Registration, Store } from '../core/contracts.ts';
import type { Ownership } from '../core/game-contracts.ts';
import type { OpponentPolicy, PayoutPolicy } from '../core/rules.ts';
import { seededRandom } from '../core/random.ts';
import { Game } from '../application/game.ts';
import { pointerAgent } from '../application/agents.ts';
import type { PointerAgent } from '../application/agents.ts';
import type { BrowserHost, InputFactory, OutputFactory, PresentationFactory } from '../adapters/browser-contracts.ts';
import { progress } from '../application/progress.ts';
import type { Presentation } from '../application/progress.ts';
import { createIndexedDbStore } from '../adapters/indexeddb.ts';
import { createOwnership } from '../adapters/locks.ts';
import { createDisplay } from '../adapters/dom.ts';
/** Discovery-generated entry passes every registry; no manually maintained implementation list. */
export async function start(registrations: readonly Registration[]): Promise<void> {
  const display = createDisplay(document);
  display.bind(() => {}, () => location.reload());
  let game: Game | null = null;
  let agent: PointerAgent | null = null;
  let running = false;
  let departed = false;
  let motion = 'standard';
  const cleanup: (() => void)[] = [];
  const active = (axis: string) => registrations.filter(row => row.axis === axis && row.status === 'minimal');
  const implementation = <T>(axis: string): T => select(active(axis)).implementation as T;
  const show = () => display.render(game?.view() ?? null, game?.status ?? 'new', game?.reason ?? '');
  try {
    const issues = checkManifest(registrations); if (issues.length) throw new Error(issues.join('; '));
    display.render(null, 'busy', '');
    const store = await createIndexedDbStore(indexedDB);
    const ownership = createOwnership(navigator.locks);
    const storage = implementation<(store: Store<unknown>, ownership: Ownership) => { store: Store<unknown>; ownership: Ownership }>('A6')(store, ownership);
    const words = new Uint32Array(ENGINE.seedWords);
    const limit = Math.floor(ENGINE.randomWordDomain / ENGINE.rngDomain) * ENGINE.rngDomain;
    do { crypto.getRandomValues(words); } while (words[0]! >= limit);
    const seed = (words[0]! % ENGINE.rngDomain) + 1;
    agent = pointerAgent();
    const host: BrowserHost = {
      document, window, view: () => game?.view() ?? null,
      request: choice => display.request(choice), show,
      bindPointer: () => display.bind(index => agent?.choose(index), () => location.reload()),
      animate: view => display.animate(view), finishPresentation: () => display.finishPresentation(),
      motionMode: () => motion, setMotionMode: mode => { motion = mode; },
    };
    for (const row of collect(active('A1'))) cleanup.push((row.implementation as InputFactory)(host));
    const outputs = collect(active('A4')).map(row => {
      const output = (row.implementation as OutputFactory)(host);
      if (output.dispose) cleanup.push(() => output.dispose!());
      return { ...output, id: row.id, priority: row.priority };
    });
    const policies = collect(active('A5')).map(row => ({ ...(row.implementation as PresentationFactory)(host), id: row.id, priority: row.priority }));
    for (const policy of policies) if (policy.dispose) cleanup.push(() => policy.dispose!());
    const presentation: Presentation = { present: view => select(policies.filter(policy => policy.applicable(motion))).present(view) };
    game = new Game({ ...storage, seed, clock: { now: () => Date.now() }, rng: seededRandom, outputs }, {
      opponent: implementation<OpponentPolicy>('A2'), payout: implementation<PayoutPolicy>('A3'),
    });
    async function pump(): Promise<void> {
      if (running || !game || !agent) return;
      running = true;
      try { while (game.status === 'ready' && !departed) { await progress(game, agent, presentation); show(); } }
      finally { running = false; show(); }
    }
    window.addEventListener('pagehide', () => { departed = true; agent?.cancel(); game?.close(); show(); for (const dispose of cleanup) dispose(); });
    window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
    await game.start(); if (departed) game.close(); show(); void pump();
  } catch (error) { game?.close(); for (const dispose of cleanup) dispose(); display.render(null, 'stopped', String(error)); }
}

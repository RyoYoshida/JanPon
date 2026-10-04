import { ENGINE } from '../spec.ts';
import { select, collect, checkManifest } from '../core/registry.ts';
import type { Registration, Store } from '../core/contracts.ts';
import type { Output, GameView, Ownership } from '../core/game-contracts.ts';
import type { OpponentPolicy, PayoutPolicy } from '../core/rules.ts';
import { seededRandom } from '../core/random.ts';
import { Game } from '../application/game.ts';
import type { PointerAgent } from '../application/agents.ts';
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
    const outputs = collect(active('A4')).map(row => ({
      ...(row.implementation as (emit: Output['emit']) => Output)(() => show()), id: row.id, priority: row.priority,
    }));
    agent = implementation<() => PointerAgent>('A1')();
    const presentation = implementation<(present: (view: GameView) => Promise<void>) => Presentation>('A5')(view => display.animate(view));
    game = new Game({ ...storage, seed, clock: { now: () => Date.now() }, rng: seededRandom, outputs }, {
      opponent: implementation<OpponentPolicy>('A2'), payout: implementation<PayoutPolicy>('A3'),
    });
    async function pump(): Promise<void> {
      if (running || !game || !agent) return;
      running = true;
      try { while (game.status === 'ready' && !departed) { await progress(game, agent, presentation); show(); } }
      finally { running = false; show(); }
    }
    display.bind(index => agent?.choose(index), () => location.reload());
    window.addEventListener('pagehide', () => { departed = true; agent?.cancel(); game?.close(); });
    window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
    await game.start(); if (departed) game.close(); show(); void pump();
  } catch (error) { game?.close(); display.render(null, 'stopped', String(error)); }
}

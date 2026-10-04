import type { Agent, GameView } from '../core/game-contracts.ts';
import type { Game } from './game.ts';
export interface Presentation { present(view: GameView): Promise<void> }
/** Same progression entry point used by the live browser and unattended/replay drivers. */
export async function progress(game: Game, agent: Agent, presentation: Presentation): Promise<void> {
  if (game.status !== 'ready') return;
  const before = game.snapshot(); if (!before) return;
  if (before.phase === 'result') {
    try { await presentation.present(game.view()!); } catch { /* Presentation is non-authoritative. */ }
    await game.settle(before.revision);
    return;
  }
  await game.step(agent);
  const view = game.view();
  if (game.status === 'ready' && view?.phase === 'choosing' && view.result?.outcome === 'draw') {
    try { await presentation.present(view); } catch { /* Input can continue after rejected effects. */ }
  }
}

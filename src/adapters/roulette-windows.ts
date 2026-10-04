import { ENGINE, SPEC } from '../spec.ts';
import type { GameView } from '../core/game-contracts.ts';

/** Select only among windows of the already committed award. No game RNG/state access.
 * A balanced deterministic rotation, not an additional random draw: every candidate
 * occurs once per candidate-count consecutive balances. The same public view always
 * restores the same window, including reduced motion and reloads. */
export function prizeWindow(values: readonly number[], view: GameView): number {
  if (view.result?.outcome !== 'win') return -1;
  const matches = values.flatMap((value, index) => value === view.result!.payout ? [index] : []);
  if (!matches.length) return -1;
  const offset = SPEC.hands.indexOf(view.result.player);
  return matches[(view.balance % matches.length + offset) % matches.length] ?? -1;
}

/** Clockwise travel starts at the top, makes two circuits, then decelerates to
 * the committed window. The last timed frame is its immediate predecessor;
 * revealPrize advances one final step at the original reveal deadline. */
export function rouletteFrames(values: readonly number[], view: GameView): { index: number; duration: number }[] {
  const stop = prizeWindow(values, view);
  if (stop < 0) return [];
  const count = values.length + values.length + stop;
  const weights = Array.from({ length: count }, (_, index) => {
    const progress = 1 + index / count;
    return progress * progress;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const budget = ENGINE.resultDurationMs - ENGINE.drawDurationMs;
  let cumulative = 0, previous = 0;
  return weights.map((weight, index) => {
    cumulative += weight;
    const deadline = Math.round(budget * cumulative / total);
    const duration = deadline - previous;
    previous = deadline;
    return { index: index % values.length, duration };
  });
}

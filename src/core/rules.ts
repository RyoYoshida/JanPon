import { SPEC } from '../spec.ts';
import type { Hand, Outcome, StateRng, RandomStep } from './game-contracts.ts';
export interface OpponentPolicy { pick(rng: StateRng, state: number): { hand: Hand; state: number } }
export interface PayoutPolicy { pick(rng: StateRng, state: number): RandomStep }
export const uniformOpponent: OpponentPolicy = {
  pick(rng, state) {
    const next = rng.next(state, SPEC.hands.length);
    const hand = SPEC.hands[next.value];
    if (!hand) throw new Error('RNG produced invalid hand index');
    return { hand, state: next.state };
  },
};
export function payoutAt(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= SPEC.payoutWeightTotal) throw new Error('invalid payout integer');
  let boundary = 0;
  for (const row of SPEC.payoutTable) {
    boundary += row.weight;
    if (value < boundary) return row.medals;
  }
  throw new Error('invalid payout table');
}
export const fixedPayout: PayoutPolicy = {
  pick(rng, state) { const next = rng.next(state, SPEC.payoutWeightTotal); return { value: payoutAt(next.value), state: next.state }; },
};
const beats: Record<Hand, Hand> = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
export function outcome(player: Hand, opponent: Hand): Outcome {
  if (!SPEC.hands.includes(player) || !SPEC.hands.includes(opponent)) throw new Error('invalid hand');
  return player === opponent ? 'draw' : beats[player] === opponent ? 'win' : 'loss';
}

import { SPEC } from '../spec.ts';
import type { Choice, GameState, StateRng } from './game-contracts.ts';
import type { OpponentPolicy, PayoutPolicy } from './rules.ts';
import { outcome } from './rules.ts';
import { initialState, assertState, copyState } from './state.ts';
export interface Rules { opponent: OpponentPolicy; payout: PayoutPolicy }
export type Action = Choice | { kind: 'advance' };
export const TRANSITIONS = {
  idle: ['coin'], choosing: ['hand'], result: ['advance'], 'game-over': ['restart'],
} as const;
export function transition(current: GameState, action: Action, rng: StateRng, rules: Rules, now: number): GameState {
  assertState(current);
  if (!(TRANSITIONS[current.phase] as readonly string[]).includes(action.kind)) return current;
  let next = copyState(current);
  if (action.kind === 'coin') {
    const pick = rules.opponent.pick(rng, current.rngState);
    next.roundNumber++; next.balance -= SPEC.stake; next.phase = 'choosing'; next.rngState = pick.state;
    next.round = { number: next.roundNumber, balanceBefore: current.balance, opponent: pick.hand, result: null };
  } else if (action.kind === 'hand') {
    const round = next.round;
    if (!round) throw new Error('missing round');
    const result = outcome(action.hand, round.opponent);
    round.result = { player: action.hand, opponent: round.opponent, outcome: result, payout: 0 };
    if (result === 'draw') {
      const pick = rules.opponent.pick(rng, next.rngState); round.opponent = pick.hand; next.rngState = pick.state;
    } else {
      next.phase = 'result';
      if (result === 'win') { const pick = rules.payout.pick(rng, next.rngState); round.result.payout = pick.value; next.rngState = pick.state; }
    }
  } else if (action.kind === 'advance') {
    next.balance += next.round!.result!.payout;
    next.phase = next.balance === 0 ? 'game-over' : 'idle';
  } else next = initialState(current.rngState, now);
  next.revision = current.revision + 1; next.updatedAt = now;
  assertState(next); return next;
}

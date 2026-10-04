import { ENGINE, SPEC } from '../spec.ts';
import { assertBalance } from './invariants.ts';
import { assertSeed } from './random.ts';
import { outcome } from './rules.ts';
import type { GameState, Hand } from './game-contracts.ts';
export function initialState(seed: number, now: number): GameState {
  const state: GameState = { schema: ENGINE.schema, revision: 0, phase: 'idle', balance: SPEC.initialBalance,
    roundNumber: 0, rngState: seed, round: null, updatedAt: now };
  assertState(state); return state;
}
/** Fail closed on unrecognized or inconsistent data; never repairs/deletes an input. */
export function assertState(value: unknown): asserts value is GameState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid saved object');
  const s = value as GameState;
  if (s.schema !== ENGINE.schema) throw new Error('unsupported save version');
  assertBalance(s.revision); assertBalance(s.balance); assertBalance(s.roundNumber); assertSeed(s.rngState);
  if (!Number.isFinite(s.updatedAt)) throw new Error('invalid timestamp');
  if (!['idle', 'choosing', 'result', 'game-over'].includes(s.phase)) throw new Error('invalid phase');
  const r = s.round;
  if (r === null) {
    if (s.phase !== 'idle' || s.roundNumber !== 0 || s.balance !== SPEC.initialBalance) throw new Error('missing current round');
    return;
  }
  if (!r || typeof r !== 'object') throw new Error('invalid round');
  assertBalance(r.number); assertBalance(r.balanceBefore);
  if (r.number !== s.roundNumber || r.number < 1 || r.balanceBefore < SPEC.stake || !SPEC.hands.includes(r.opponent)) throw new Error('invalid funded round');
  const result = r.result;
  if (result !== null) {
    if (!result || typeof result !== 'object') throw new Error('invalid result');
    if (!SPEC.hands.includes(result.player as Hand) || !SPEC.hands.includes(result.opponent as Hand)
      || result.outcome !== outcome(result.player, result.opponent)) throw new Error('invalid result hands');
    if (result.outcome === 'win' ? !SPEC.payoutTable.some(row => row.medals === result.payout) : result.payout !== 0) throw new Error('invalid result payout');
  }
  const debited = r.balanceBefore - SPEC.stake;
  if (s.phase === 'choosing') {
    if (s.balance !== debited || (result && result.outcome !== 'draw')) throw new Error('invalid choosing accounting');
  } else {
    if (!result || result.outcome === 'draw' || r.opponent !== result.opponent) throw new Error('missing decisive result');
    const expected = s.phase === 'result' ? debited : debited + result.payout;
    if (s.balance !== expected) throw new Error('invalid settlement accounting');
    if (s.phase === 'game-over' ? s.balance !== 0 : s.phase === 'idle' && s.balance === 0) throw new Error('invalid terminal state');
  }
}
export function copyState(state: GameState): GameState { return JSON.parse(JSON.stringify(state)) as GameState; }

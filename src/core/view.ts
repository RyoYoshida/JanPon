import { SPEC } from '../spec.ts';
import type { Choice, GameState, GameView } from './game-contracts.ts';
export function publicView(state: GameState): GameView {
  const choices: Choice[] = state.phase === 'idle' ? [{ kind: 'coin' }]
    : state.phase === 'choosing' ? SPEC.hands.map(hand => ({ kind: 'hand', hand }))
    : state.phase === 'game-over' ? [{ kind: 'restart' }] : [];
  const result = state.round?.result;
  return { phase: state.phase, balance: state.balance, choices,
    result: result ? { player: result.player, opponent: result.opponent, outcome: result.outcome, payout: result.payout } : null };
}

import type { Clock, Store, Prioritized } from './contracts.ts';
import type { SPEC } from '../spec.ts';
export type Hand = typeof SPEC.hands[number];
export type Outcome = 'draw' | 'win' | 'loss';
export type Phase = 'idle' | 'choosing' | 'result' | 'game-over';
export interface Result { player: Hand; opponent: Hand; outcome: Outcome; payout: number }
export interface Round { number: number; balanceBefore: number; opponent: Hand; result: Result | null }
/** Current round only, not a long-term ledger or accounting test fixture. */
export interface GameState {
  schema: string; revision: number; phase: Phase; balance: number;
  roundNumber: number; rngState: number; round: Round | null; updatedAt: number;
}
export type Choice = { kind: 'coin' } | { kind: 'hand'; hand: Hand } | { kind: 'restart' };
export interface GameView { phase: Phase; balance: number; choices: readonly Choice[]; result: Result | null }
export interface Agent extends Prioritized { decide(view: GameView): Promise<number> }
export interface RandomStep { value: number; state: number }
export interface StateRng { next(state: number, exclusiveUpperBound: number): RandomStep }
export interface Lease { release(): void }
export interface Ownership { acquire(): Promise<Lease | null> }
export interface GameEvent { kind: 'state'; view: GameView }
export interface Output extends Prioritized { emit(event: GameEvent): void | Promise<void> }
export interface GamePorts {
  /** write resolves only after transaction termination; unknown must be safe to reread under the lease. */
  clock: Clock; rng: StateRng; store: Store<unknown>; ownership: Ownership;
  outputs: readonly Output[]; seed: number;
}
export type AppStatus = 'new' | 'ready' | 'busy' | 'stopped' | 'other-tab' | 'closed';

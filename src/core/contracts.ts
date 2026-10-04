/** Verification seams only; no product state schema or frozen stage-7 view contract. */
export interface Clock { now(): number }
export interface Rng { nextInteger(exclusiveUpperBound: number): number }
export type StoreRead<T> = { kind: 'loaded'; value: T } | { kind: 'empty' } | { kind: 'failed'; reason: string };
export type StoreWrite = { kind: 'committed' } | { kind: 'failed'; reason: string } | { kind: 'unknown'; reason: string };
export interface Store<T> {
  read(): Promise<StoreRead<T>>;
  write(value: T): Promise<StoreWrite>;
}
export interface Dependencies<T> { clock: Clock; rng: Rng; store: Store<T> }
export interface Prioritized { readonly id: string; readonly priority: number }
export interface Registration extends Prioritized {
  readonly axis: string;
  readonly status: 'unimplemented' | 'minimal';
  readonly implementation?: unknown;
  readonly taskIds: readonly string[];
}
export interface AccountingEntry {
  readonly kind: 'stake' | 'settlement';
  readonly roundId: string;
  readonly amount: number;
}
export interface FixtureRound {
  readonly id: string;
  readonly outcome: 'pending' | 'draw' | 'win' | 'loss';
  readonly payout: number;
  readonly settlement: 'pending' | 'complete';
}
export interface AccountingFixture {
  readonly initialBalance: number;
  readonly balance: number;
  readonly entries: readonly AccountingEntry[];
  readonly phase: 'idle' | 'choosing' | 'win-result' | 'loss-result' | 'settled' | 'game-over';
  readonly round?: FixtureRound;
}

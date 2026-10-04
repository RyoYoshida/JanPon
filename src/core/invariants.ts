import { SPEC } from '../spec.ts';
import type { AccountingFixture } from './contracts.ts';

export function assertBalance(balance: number): void {
  if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('balance must be a nonnegative safe integer');
}
export function assertWeights(weights: readonly number[], expectedTotal: number): void {
  if (!weights.length || !Number.isSafeInteger(expectedTotal) || expectedTotal <= 0) throw new Error('invalid weight total');
  let total = 0;
  for (const weight of weights) {
    if (!Number.isSafeInteger(weight) || weight < 0) throw new Error('invalid weight');
    total += weight;
    if (!Number.isSafeInteger(total)) throw new Error('unsafe weight total');
  }
  if (total !== expectedTotal) throw new Error('weight total mismatch');
}

/** Validates supplied evidence only. It cannot execute a round or certify browser persistence. */
export function assertAccountingFixture(fixture: AccountingFixture): void {
  assertBalance(fixture.initialBalance);
  assertBalance(fixture.balance);
  let total = fixture.initialBalance;
  const stakes = new Set<string>();
  const settlements = new Map<string, number>();
  for (const entry of fixture.entries) {
    assertBalance(entry.amount);
    if (!entry.roundId) throw new Error('empty round ID');
    if (entry.kind === 'stake') {
      if (stakes.has(entry.roundId) || entry.amount !== SPEC.stake) throw new Error('invalid or duplicate stake');
      stakes.add(entry.roundId);
      total -= entry.amount;
    } else if (entry.kind === 'settlement') {
      if (!stakes.has(entry.roundId) || settlements.has(entry.roundId)) throw new Error('unfunded or duplicate settlement');
      if (entry.amount !== 0 && !SPEC.payoutTable.some(row => row.medals === entry.amount)) throw new Error('invalid payout');
      settlements.set(entry.roundId, entry.amount);
      total += entry.amount;
    } else throw new Error('invalid accounting kind');
    assertBalance(total);
  }
  if (total !== fixture.balance) throw new Error('accounting total mismatch');
  const round = fixture.round;
  const pending = [...stakes].filter(id => !settlements.has(id));
  if (fixture.phase === 'idle') {
    if (round || pending.length || fixture.balance === 0) throw new Error('idle phase mismatch');
    return;
  }
  if (!round || !stakes.has(round.id)) throw new Error('missing funded round');
  assertBalance(round.payout);
  if (pending.some(id => id !== round.id)) throw new Error('unrelated pending round');
  if (fixture.phase === 'choosing') {
    if (!['pending', 'draw'].includes(round.outcome) || round.payout !== 0 || round.settlement !== 'pending' || settlements.has(round.id)) throw new Error('choosing phase mismatch');
    return;
  }
  if (round.outcome !== 'win' && round.outcome !== 'loss') throw new Error('missing final outcome');
  if (round.outcome === 'loss' ? round.payout !== 0 : !SPEC.payoutTable.some(row => row.medals === round.payout)) throw new Error('outcome payout mismatch');
  if (fixture.phase === 'win-result' || fixture.phase === 'loss-result') {
    if (fixture.phase !== `${round.outcome}-result` || round.settlement !== 'pending' || settlements.has(round.id)) throw new Error('result phase mismatch');
    return;
  }
  if (!['settled', 'game-over'].includes(fixture.phase)) throw new Error('unknown phase');
  if (round.settlement !== 'complete' || settlements.get(round.id) !== round.payout || pending.length) throw new Error('settlement phase mismatch');
  if (fixture.phase === 'game-over' && fixture.balance !== 0) throw new Error('terminal balance mismatch');
}

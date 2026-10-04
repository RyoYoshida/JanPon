import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { SPEC, AXIS_MANIFEST, MANIFEST_AUTHORITY } from '../../src/spec.ts';
import { collect, select, add, checkManifest } from '../../src/core/registry.ts';
import { assertBalance, assertWeights, assertAccountingFixture } from '../../src/core/invariants.ts';

async function registrations(directory = new URL('../../src/registrations/', import.meta.url)) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) result.push(...await registrations(url));
    else if (entry.name.endsWith('.registration.ts')) result.push((await import(url.href)).registration);
  }
  return result;
}

test('spec constants match independently approved GOAL values', () => {
  assert.equal(SPEC.initialBalance, 10);
  assert.equal(SPEC.stake, 1);
  assert.deepEqual(SPEC.hands, ['rock', 'scissors', 'paper']);
  assert.deepEqual(SPEC.opponentWeights, [1, 1, 1]);
  assert.equal(SPEC.opponentWeightTotal, 3);
  assert.deepEqual(SPEC.payoutTable, [
    { medals: 1, weight: 65 }, { medals: 2, weight: 18 },
    { medals: 4, weight: 11 }, { medals: 7, weight: 5 }, { medals: 20, weight: 1 },
  ]);
  assert.equal(SPEC.payoutWeightTotal, 100);
  assert.equal(SPEC.expectedWinPayout, 2);
  assert.deepEqual(SPEC.decisiveWinProbability, { numerator: 1, denominator: 2 });
  assert.deepEqual(SPEC.theoreticalReturn, { numerator: 100, denominator: 100 });
});

test('six provisional axes are discoverable with honest connection status', async () => {
  const found = await registrations();
  assert.deepEqual(AXIS_MANIFEST.map(x => [x.axis, x.mode, [...x.ids]]), [
    ['A1', 'collect', ['pointer', 'keyboard']], ['A2', 'select', ['uniform-opponent']],
    ['A3', 'select', ['fixed-100']], ['A4', 'collect', ['display', 'audio']],
    ['A5', 'select', ['standard', 'reduced']], ['A6', 'select', ['indexeddb']],
  ]);
  assert.match(MANIFEST_AUTHORITY, /provisional/);
  assert.equal(found.length, 9);
  assert.deepEqual(checkManifest(found), []);
  for (const row of found) { assert.ok(['unimplemented','minimal'].includes(row.status)); if(row.status==='minimal')assert.ok(row.implementation); assert.ok(row.taskIds.length); }
  assert.deepEqual(checkManifest(found.filter(x => x.id !== 'pointer')), ['missing:A1:pointer']);
  assert.deepEqual(checkManifest([...found, { ...found[0], axis: 'A7', id: 'extra' }]), ['extra:A7:extra']);
  assert.deepEqual(checkManifest([...found, found[0]]), [`duplicate:${found[0].axis}:${found[0].id}`]);
  const statusIssues = found.map(x => `status:${x.axis}:${x.id}`).sort();
  assert.deepEqual(checkManifest(found.map(x => ({ ...x, status: 'invented' }))), statusIssues);
  assert.deepEqual(checkManifest(found.map(x => ({ ...x, priority: NaN }))), found.map(x => `priority:${x.axis}:${x.id}`).sort());
  assert.deepEqual(checkManifest(found.map(x => ({ ...x, taskIds: [] }))), statusIssues);
  assert.deepEqual(checkManifest(found.map(x => ({ ...x, taskIds: ['invalid'] }))), statusIssues);
});

test('priority collect/select/add do not mutate callers; ties have stable ID order', () => {
  const entries = [{ id: 'z', priority: 1, value: 4 }, { id: 'b', priority: 3, value: -2 }, { id: 'a', priority: 3, value: 5 }];
  const before = structuredClone(entries);
  assert.deepEqual(collect(entries).map(x => x.id), ['a', 'b', 'z']);
  assert.equal(select(entries).id, 'a');
  assert.equal(add(entries), 7);
  assert.deepEqual(entries, before);
  assert.throws(() => select([]), /no applicable/);
  assert.deepEqual(collect([]), []);
  assert.equal(add([]), 0);
  assert.throws(() => collect([...entries, entries[0]]), /duplicate/);
  assert.throws(() => collect([{ id: '', priority: 0 }]), /empty/);
  for (const priority of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => collect([{ id: 'x', priority }]), /priority/);
  for (const value of [NaN, Infinity]) assert.throws(() => add([{ id: 'x', priority: 0, value }]), /contribution/);
  assert.throws(() => add([{ id: 'a', priority: 0, value: Number.MAX_VALUE }, { id: 'b', priority: 0, value: Number.MAX_VALUE }]), /contribution/);
});

test('balance and weight invariants reject invalid supplied evidence', () => {
  for (const value of [0, 1, 20, Number.MAX_SAFE_INTEGER]) assert.doesNotThrow(() => assertBalance(value));
  for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => assertBalance(value));
  assert.doesNotThrow(() => assertWeights([65, 18, 11, 5, 1], 100));
  assert.doesNotThrow(() => assertWeights([1, 1, 1], 3));
  assert.doesNotThrow(() => assertWeights([0, 2], 2));
  for (const [weights, total] of [[[], 1], [[1], 0], [[1], 2], [[-1, 2], 1], [[0.5], 1], [[NaN], 1], [[1], Infinity], [[Number.MAX_SAFE_INTEGER, 1], 1]]) assert.throws(() => assertWeights(weights, total));
});

const stake = { kind: 'stake', roundId: 'r', amount: 1 };
const round = { id: 'r', outcome: 'win', payout: 20, settlement: 'pending' };
const pendingWin = { initialBalance: 10, balance: 9, entries: [stake], phase: 'win-result', round };
const settled = { ...pendingWin, balance: 29, phase: 'settled', entries: [stake, { kind: 'settlement', roundId: 'r', amount: 20 }], round: { ...round, settlement: 'complete' } };

test('fixture-only accounting accepts independent last-medal/draw/win/loss evidence', () => {
  const valid = [
    { initialBalance: 10, balance: 10, entries: [], phase: 'idle' },
    { initialBalance: 1, balance: 0, entries: [stake], phase: 'choosing', round: { ...round, outcome: 'draw', payout: 0 } },
    pendingWin, settled,
    { initialBalance: 1, balance: 0, entries: [stake, { kind: 'settlement', roundId: 'r', amount: 0 }], phase: 'settled', round: { ...round, outcome: 'loss', payout: 0, settlement: 'complete' } },
    { ...pendingWin, phase: 'loss-result', round: { ...round, outcome: 'loss', payout: 0 } },
    { initialBalance: 1, balance: 0, entries: [stake, { kind: 'settlement', roundId: 'r', amount: 0 }], phase: 'game-over', round: { ...round, outcome: 'loss', payout: 0, settlement: 'complete' } },
  ];
  for (const fixture of valid) assert.doesNotThrow(() => assertAccountingFixture(fixture));
});

test('fixture accounting detects total, duplicate settlement and phase corruption', () => {
  const invalid = [
    { ...settled, balance: 28 },
    { ...settled, balance: 49, entries: [...settled.entries, settled.entries[1]] },
    { ...pendingWin, balance: 8, entries: [stake, stake] },
    { ...pendingWin, initialBalance: 0, balance: 0 },
    { ...pendingWin, entries: [{ ...stake, amount: 2 }] },
    { ...settled, entries: [settled.entries[1], stake] },
    { ...settled, entries: [stake, { ...settled.entries[1], amount: 3 }], balance: 12 },
    { ...pendingWin, phase: 'idle' },
    { ...pendingWin, round: undefined },
    { ...pendingWin, phase: 'choosing' },
    { ...pendingWin, phase: 'loss-result' },
    { ...settled, phase: 'win-result' },
    { ...settled, phase: 'game-over' },
    { ...settled, round: { ...settled.round, settlement: 'pending' } },
    { ...settled, round: { ...settled.round, payout: 7 } },
    { ...pendingWin, round: { ...round, outcome: 'loss' } },
    { ...pendingWin, round: { ...round, outcome: 'draw' } },
    { ...pendingWin, round: { ...round, payout: 3 } },
    { ...pendingWin, phase: 'invented' },
    { ...pendingWin, balance: 8, entries: [stake, { ...stake, roundId: 'other' }] },
    { initialBalance: 0, balance: 0, entries: [], phase: 'idle' },
  ];
  for (const fixture of invalid) assert.throws(() => assertAccountingFixture(fixture), JSON.stringify(fixture));
});

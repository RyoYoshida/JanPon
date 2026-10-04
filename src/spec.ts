/** GOAL §2–3 values. Internal registration IDs remain provisional until later gates. */
export const SPEC = {
  initialBalance: 10,
  stake: 1,
  hands: ['rock', 'scissors', 'paper'],
  opponentWeights: [1, 1, 1],
  opponentWeightTotal: 3,
  payoutTable: [
    { medals: 1, weight: 65 },
    { medals: 2, weight: 18 },
    { medals: 4, weight: 11 },
    { medals: 7, weight: 5 },
    { medals: 20, weight: 1 },
  ],
  payoutWeightTotal: 100,
  expectedWinPayout: 2,
  decisiveWinProbability: { numerator: 1, denominator: 2 },
  theoreticalReturn: { numerator: 100, denominator: 100 },
  defaultPriority: 0,
} as const;

export const AXIS_MANIFEST = [
  { axis: 'A1', mode: 'collect', ids: ['pointer', 'keyboard'] },
  { axis: 'A2', mode: 'select', ids: ['uniform-opponent'] },
  { axis: 'A3', mode: 'select', ids: ['fixed-100'] },
  { axis: 'A4', mode: 'collect', ids: ['display', 'audio'] },
  { axis: 'A5', mode: 'select', ids: ['standard', 'reduced'] },
  { axis: 'A6', mode: 'select', ids: ['indexeddb'] },
] as const;
export const MANIFEST_AUTHORITY = 'provisional internal mapping of GOAL section 2; not human-selected IDs' as const;

/** Stage-7 reversible internal version/timing defaults, not new player settings. */
export const ENGINE = {
  schema: 'janpon/1-pm48271',
  rngModulus: 2147483647,
  rngMultiplier: 48271,
  rngDomain: 2147483646,
  resultDurationMs: 1800,
  drawDurationMs: 450,
  lampStepMs: 45,
  seedWords: 1,
  randomWordDomain: 4294967296,
  databaseName: 'janpon-v1',
  databaseVersion: 1,
  storeName: 'game',
  stateKey: 'current',
  lockName: 'janpon-v1-owner',
} as const;

/** Provisional presentation tuning; no rule, payout, or accounting authority. */
export const EFFECTS = {
  audioDurationSeconds: 0.12, audioGain: 0.045, audioFloor: 0.001,
  frequencies: { start: 440, draw: 330, win: 660, loss: 220, payout: 880 },
  selectedPriority: 1,
  payoutDurationMs: { 1: 800, 2: 1000, 4: 1400, 7: 1800, 20: 3000 },
  coinFlightMs: 600,
} as const;

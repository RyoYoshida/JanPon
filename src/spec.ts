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

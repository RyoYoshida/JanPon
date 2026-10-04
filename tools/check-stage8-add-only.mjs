import { mkdir, writeFile } from 'node:fs/promises';
// The original private checkpoint compared historical implementation and review
// baselines. Those inputs are not included in this publication-safe history.
// Current automated tests remain available through npm run check.
const report = {
  status: 'NOT_AVAILABLE',
  scope: 'historical extension add-only checkpoint',
  reason: 'Required original baseline and review documents are not distributed. No historical result is inferred.',
  currentChecks: 'npm run check',
};
await mkdir('.verification', { recursive: true });
await writeFile('.verification/stage8-add-only.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = 2;

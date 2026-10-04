import test from 'node:test';
import assert from 'node:assert/strict';
import { checkGoldens } from '../tools/golden-contracts.mjs';
test('all approved semantics and independent foundation fixtures remain aligned', async () => {
 const report = await checkGoldens(process.env.JANPON_GOLDEN_PATH);
 assert.equal(report.rows,20); assert.equal(report.payoutSlots,100);
 assert.match(report.productBehavior,/NOT_IMPLEMENTED/);
});

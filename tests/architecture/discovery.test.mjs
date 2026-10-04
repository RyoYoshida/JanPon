import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discover } from '../../tools/discover.mjs';
import { build } from '../../tools/build.mjs';
test('new nested modules and tests are found without list edits', async () => {
 const root = await mkdtemp(join(tmpdir(), 'janpon-discovery-'));
 try {
  await mkdir(join(root, 'src/nested'), {recursive:true});
  await mkdir(join(root, 'tests/nested'), {recursive:true});
  await writeFile(join(root,'package.json'),'{"type":"module"}');
  await writeFile(join(root,'src/nested/new.registration.ts'),'export const registration = { id: "new", priority: 0 };');
  await writeFile(join(root,'tests/nested/new.test.mjs'),'');
  assert.equal((await discover(join(root,'tests'), p => p.endsWith('.test.mjs'))).length, 1);
  const result = await build(root);
  assert.equal(result.sourceModules, 1); assert.equal(result.registrationModules, 1);
  const emitted = await discover(join(root,'dist'), p => p.endsWith('.js'));
  assert.equal(emitted.length, 2);
 } finally { await rm(root, {recursive:true,force:true}); }
});

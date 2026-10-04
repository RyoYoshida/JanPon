import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectExtensions } from '../../src/core/extensions.ts';
import { discover } from '../../tools/discover.mjs';
import { build } from '../../tools/build.mjs';
const rows = await Promise.all((await discover('src/registrations', p => p.endsWith('.registration.ts'))).map(async p => (await import(pathToFileURL(resolve(p)).href)).registration));
const extension = { axis: 'A1', id: 'keyboard', implementation: () => {}, taskIds: ['T08-01'] };
test('foundation extensions resolve only planned unimplemented rows, without mutation or shadowing', () => {
 const result = connectExtensions(rows, [extension]);
 assert.equal(result.length, 9); assert.equal(result.find(r=>r.id==='keyboard').status,'minimal');
 assert.equal(rows.find(r=>r.id==='keyboard').status,'unimplemented');
 assert.throws(()=>connectExtensions(rows,[extension,extension]),/Invalid extension/);
 for(const invalid of [{...extension,id:'pointer'},{...extension,id:'new'},{...extension,axis:'A4'},{...extension,implementation:undefined},{...extension,taskIds:[]},{...extension,priority:NaN}])assert.throws(()=>connectExtensions(rows,[invalid]));
 assert.throws(()=>connectExtensions([...rows,rows[0]],[]),/duplicate/);
 assert.throws(()=>connectExtensions(rows.slice(1),[]),/missing/);
});
test('new extension modules are automatically statically connected by the generated entry',async()=>{
 const root=await mkdtemp(join(tmpdir(),'janpon-extension-discovery-'));
 try {
  await cp('src',join(root,'src'),{recursive:true,filter:path=>!path.endsWith('.extension.ts')});await writeFile(join(root,'package.json'),'{"type":"module"}');
  await mkdir(join(root,'src/adapters/probe'),{recursive:true});
  await writeFile(join(root,'src/adapters/probe/probe.extension.ts'),"export const extension={axis:'A1',id:'keyboard',implementation:()=>({marker:'discovered'}),taskIds:['T08-01']};");
  await build(root);
  const {registrations}=await import(pathToFileURL(join(root,'dist/.generated/registrations.js')).href);
  const row=registrations.find(r=>r.id==='keyboard');assert.equal(row.status,'minimal');assert.equal(row.implementation().marker,'discovered');
 } finally {await rm(root,{recursive:true,force:true});}
});

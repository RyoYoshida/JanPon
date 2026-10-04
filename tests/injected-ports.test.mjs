import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
test('injection contracts accept controlled ports and reject a falsely successful Store result', async () => {
 const root=await mkdtemp(join(tmpdir(),'janpon-ports-'));
 try {
  await writeFile(join(root,'package.json'),'{"type":"module"}');
  const path=join(root,'ports.ts');
  const header=`import type { Dependencies } from ${JSON.stringify(resolve('src/core/contracts.ts'))};\n`;
  const source=header+`const ports: Dependencies<{balance:number}> = {
   clock: { now: () => 42 }, rng: { nextInteger: bound => bound - 1 },
   store: { read: async () => ({kind:'failed',reason:'injected'}), write: async () => ({kind:'unknown',reason:'completion lost'}) }
  };`;
  const options={strict:true,target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,lib:['lib.es2023.d.ts'],allowImportingTsExtensions:true,noEmit:true};
  await writeFile(path,source);
  assert.equal(ts.getPreEmitDiagnostics(ts.createProgram([path],options)).length,0);
  await writeFile(path,source.replace("kind:'unknown'","kind:'success'"));
  const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram([path],options));
  assert.ok(diagnostics.some(d=>ts.flattenDiagnosticMessageText(d.messageText,' ').includes('success')));
 } finally {await rm(root,{recursive:true,force:true});}
});

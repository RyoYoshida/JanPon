import { mkdtemp, cp, symlink, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { discover } from './discover.mjs';
const root = process.cwd();
const start = performance.now();
async function hashes() {
 const files = [...await discover('src',p=>true),...await discover('tests/golden',p=>true)];
 return Object.fromEntries(await Promise.all(files.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
}
const before = await hashes(), results=[];
const faults = [
 ['golden-wrong-result', async dir=>{const path=join(dir,'tests/golden/approved-examples.json');const doc=JSON.parse(await readFile(path,'utf8'));doc.rows[1].expected='負け';await writeFile(path,JSON.stringify(doc));}, /G02 approved semantic expectation/],
 ['invariant-disabled',async dir=>{const path=join(dir,'src/core/invariants.ts');let s=await readFile(path,'utf8');const exact="if (total !== fixture.balance) throw new Error('accounting total mismatch');";if(!s.includes(exact))throw new Error('Mutation anchor absent');await writeFile(path,s.replace(exact,'/* intentionally disabled accounting total check */'));},/Missing expected exception/],
 ['reverse-dependency',async dir=>{await mkdir(join(dir,'src/adapters'),{recursive:true});await writeFile(join(dir,'src/adapters/bad.ts'),'export const external = 0;');await writeFile(join(dir,'src/core/bad.ts'),'export { external } from "../adapters/bad.ts";');},/Reverse or unknown dependency/],
 ['missing-registration',async dir=>{const files=await discover(join(dir,'src'),p=>p.endsWith('.registration.ts'));await rm(files[0]);},/missing:/],
 ['duplicate-registration',async dir=>{const files=await discover(join(dir,'src'),p=>p.endsWith('.registration.ts'));await cp(files[0],join(dir,'src/registrations/duplicate.registration.ts'));},/duplicate:/],
 ['extra-registration',async dir=>{const files=await discover(join(dir,'src'),p=>p.endsWith('.registration.ts'));let s=await readFile(files[0],'utf8');s=s.replace(/id: '[^']+'/,"id: 'unapproved-extra'");await writeFile(join(dir,'src/registrations/extra.registration.ts'),s);},/extra:/],
 ['new-test-discovery',async dir=>{await mkdir(join(dir,'tests/nested-fault'),{recursive:true});await writeFile(join(dir,'tests/nested-fault/new.test.mjs'),'import test from "node:test"; test("injected discovered test",()=>{throw new Error("discovery fault");});');},/discovery fault/],
 ['new-module-discovery',async dir=>{await writeFile(join(dir,'src/core/new.ts'),'export const injected: string = 1;');},/not assignable to type 'string'/],
 ['spec-regression',async dir=>{const path=join(dir,'src/spec.ts');const s=await readFile(path,'utf8');if(!s.includes('initialBalance: 10'))throw new Error('Mutation anchor absent');await writeFile(path,s.replace('initialBalance: 10','initialBalance: 11'));},/11 !== 10/],
];
try {
 for (const [name, mutate, expected] of faults) {
  const dir=await mkdtemp(join(tmpdir(),'janpon-fault-'));
  try {
   for(const path of ['src','tools','tests','mock','game','package.json','GOAL.md']) await cp(resolve(root,path),join(dir,path),{recursive:true});
   await symlink(resolve(root,'node_modules'),join(dir,'node_modules'),'dir');
   await mutate(dir);
   const t=performance.now();
   const result=spawnSync(process.execPath,['tools/verify.mjs'],{cwd:dir,encoding:'utf8',timeout:180000});
   const output=(result.stdout??'')+(result.stderr??'');
   const detected=result.status===1 && expected.test(output);
   results.push({name,exitCode:result.status,detected,elapsedMs:Math.round(performance.now()-t),scope:'temporary full-project copy; authoritative source and goldens untouched',matchedDiagnostic:output.match(expected)?.[0]??null});
   console.log(`${name}: exit=${result.status}, expected failure=${detected}`);
   if(!detected) throw new Error(`Fault not correctly detected: ${name}\n${output}`);
  } finally { await rm(dir,{recursive:true,force:true}); }
 }
 if(JSON.stringify(before)!==JSON.stringify(await hashes()))throw new Error('Authoritative source or golden changed');
 const clean=spawnSync(process.execPath,['tools/verify.mjs'],{encoding:'utf8',timeout:180000});
 if(clean.status!==0)throw new Error(`Clean restoration check failed\n${clean.stdout}\n${clean.stderr}`);
 const report={status:'PASS',startedUtc:new Date().toISOString(),results,authoritativeHashesUnchanged:true,cleanExitCode:clean.status,elapsedMs:Math.round(performance.now()-start)};
 await mkdir('.verification',{recursive:true});await writeFile('.verification/faults.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
} catch(error) {console.error(error);process.exitCode=1;}

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { architecture } from '../../tools/architecture.mjs';
async function fixture(source, extra = {}) {
  const root = await mkdtemp(join(tmpdir(), 'janpon-architecture-'));
  await mkdir(join(root, 'src/core'), { recursive: true });
  await writeFile(join(root, 'src/spec.ts'), 'export const value = 10;');
  await writeFile(join(root, 'src/core/example.ts'), source);
  for (const [path, contents] of Object.entries(extra)) { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), contents); }
  return root;
}
for (const [name, source, pattern, extra] of [
  ['DOM', 'export const value = document.title;', /environment/],
  ['global RNG', 'export const value = Math.random();', /RNG/],
  ['computed RNG', 'export const value = Math["random"]();', /injected RNG/],
  ['clock', 'export const value = Date.now();', /environment/],
  ['reverse dependency', 'import { value } from "../adapters/dom.ts"; export { value };', /Reverse/, { 'src/adapters/dom.ts': 'export const value = 0;' }],
  ['external dependency', 'import fs from "node:fs";', /External/],
  ['dynamic import', 'export const x = import("node:fs");', /Dynamic/],
  ['boolean parameter', 'export function x(flag: boolean | undefined) {}', /Boolean/],
  ['aliased boolean parameter', 'type Flag = boolean; export function x(flag: Flag) {}', /Boolean/],
  ['spec literal', 'export const balance = 10;', /Numeric/],
  ['fixed complement', 'export const x = (p: number) => 1 - p;', /Fixed-shape/],
  ['fixed shape', 'export const x = [0, 1];', /Fixed two/],
  ['cycle', 'import { b } from "./b.ts"; export const a = b;', /cycle/, { 'src/core/b.ts': 'import { a } from "./example.ts"; export const b = a;' }],
]) test(`architecture rejects ${name}`, async () => {
  const root = await fixture(source, extra); try { await assert.rejects(architecture(root), pattern); } finally { await rm(root, { recursive: true, force: true }); }
});
test('comments and string data do not create false environment hits', async () => {
  const root = await fixture('// document and Math.random\nexport const text = "window";');
  try { assert.equal((await architecture(root)).modules, 2); } finally { await rm(root, { recursive: true, force: true }); }
});
test('final complete source dependency graph passes', async () => { assert.ok((await architecture()).modules > 0); });

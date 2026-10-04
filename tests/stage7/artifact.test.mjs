import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
test('self-contained game artifact matches its manifest and JavaScript parses',async()=>{
 const html=await readFile('dist/JanPon.html','utf8'),manifest=JSON.parse(await readFile('dist/JanPon.manifest.json','utf8'));
 assert.equal(createHash('sha256').update(html).digest('hex'),manifest.sha256);
 assert.ok(html.includes(`name="janpon-source-sha256" content="${manifest.sourceSha256}"`));
 assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+stylesheet/);
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert.ok(script);assert.doesNotThrow(()=>new vm.Script(script));
 assert.equal((html.match(/class="lamp"/g)||[]).length,12);
 assert.equal(manifest.browser,'NOT_RUN');
});

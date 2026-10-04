import ts from 'typescript';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from './build.mjs';
/** Bundle local, statically resolved TS modules without fetching a dependency or hosting a site. */
export async function packageGame(root=process.cwd()) {
 const modules=new Map(), sourceParts=[];
 async function visit(path) {
  path=resolve(root,path); const id=relative(root,path).replaceAll('\\','/'); if(modules.has(id))return id;
  const source=await readFile(path,'utf8'); modules.set(id,null);sourceParts.push([id,source]);
  const ast=ts.createSourceFile(path,source,ts.ScriptTarget.ES2023,true,ts.ScriptKind.TS), deps={};
  for(const node of ast.statements)if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){
   const target=node.moduleSpecifier.text;if(!target.startsWith('.'))throw Error('External artifact import: '+target);
   deps[target]=await visit(resolve(dirname(path),target));
  }
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  modules.set(id,{compiled,deps});return id;
 }
 const entry=await visit('.generated/main.ts');
 const html=await readFile(resolve(root,'game/index.html'),'utf8'),css=await readFile(resolve(root,'game/style.css'),'utf8');
 sourceParts.push(['game/index.html',html],['game/style.css',css]);sourceParts.sort(([a],[b])=>a.localeCompare(b));
 const sourceSha256=createHash('sha256').update(JSON.stringify(sourceParts)).digest('hex');
 const records=[...modules].map(([id,{compiled,deps}])=>`${JSON.stringify(id)}:[function(require,module,exports){\n${compiled}\n},${JSON.stringify(deps)}]`).join(',\n');
 const script=`/* JanPon source SHA256 ${sourceSha256}; real-browser QA NOT_RUN */\n(()=>{'use strict';const modules={${records}};const cache={};function load(id){if(cache[id])return cache[id].exports;const entry=modules[id];if(!entry)throw Error('Missing module '+id);const module={exports:{}};cache[id]=module;entry[0](name=>load(entry[1][name]),module,module.exports);return module.exports;}load(${JSON.stringify(entry)});})();`;
 const artifact=html.replace('<link rel="stylesheet" href="style.css">',`<style>${css}</style>`)
  .replace(/<script type="module" src="[^"]+"><\/script>/,`<script>${script.replaceAll('</script','<\\/script')}</script>`)
  .replace('</head>',`<meta name="janpon-source-sha256" content="${sourceSha256}"></head>`);
 if(/<script[^>]+src=|<link[^>]+stylesheet/.test(artifact))throw Error('Artifact has external runtime resources');
 const target=resolve(root,'dist/JanPon.html');await mkdir(dirname(target),{recursive:true});await writeFile(target,artifact);
 const report={artifact:relative(root,target),sourceSha256,sha256:createHash('sha256').update(artifact).digest('hex'),bytes:Buffer.byteLength(artifact),modules:modules.size,browser:'NOT_RUN',scope:'self-contained game bundle; real-device and 100000-round completion verification not performed'};
 await writeFile(resolve(root,'dist/JanPon.manifest.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){await build();console.log(JSON.stringify(await packageGame(),null,2));}

import ts from 'typescript';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discover } from './discover.mjs';
export async function build(root = process.cwd()) {
  const files = await discover(resolve(root, 'src'), p => p.endsWith('.ts'));
  if (!files.length) throw new Error('No source modules discovered');
  const registrationFiles = files.filter(p => p.endsWith('.registration.ts'));
  if (!registrationFiles.length) throw new Error('No registration modules discovered');
  await mkdir(resolve(root, '.generated'), { recursive: true });
  const extensionFiles = files.filter(p => p.endsWith('.extension.ts'));
  const imports = registrationFiles.map((p, i) => `import { registration as r${i} } from ${JSON.stringify('../' + relative(root, p).replaceAll('\\', '/'))};`);
  const extensionImports = extensionFiles.map((p, i) => `import { extension as e${i} } from ${JSON.stringify('../' + relative(root, p).replaceAll('\\', '/'))};`);
  const rows = `[${registrationFiles.map((_, i) => `r${i}`).join(',')}]`;
  const linked = extensionFiles.length ? `connectExtensions(${rows}, [${extensionFiles.map((_, i) => `e${i}`).join(',')}])` : rows;
  const resolver = extensionFiles.length ? `import { connectExtensions } from '../src/core/extensions.ts';\n` : '';
  await writeFile(resolve(root, '.generated/registrations.ts'), `${imports.join('\n')}\n${extensionImports.join('\n')}\n${resolver}export const registrations = ${linked};\n`);
  const entry = resolve(root, 'src/bootstrap/main.ts');
  const generatedEntry = resolve(root, '.generated/main.ts');
  const entries = files.includes(entry) ? [generatedEntry] : [];
  if (entries.length) await writeFile(generatedEntry, `import { start } from '../src/bootstrap/main.ts';\nimport { registrations } from './registrations.ts';\nvoid start(registrations);\n`);
  await rm(resolve(root, 'dist'), { recursive: true, force: true });
  const options = { strict: true, target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'],
    rootDir: root, outDir: resolve(root, 'dist'), rewriteRelativeImportExtensions: true,
    noEmitOnError: true, noUncheckedIndexedAccess: true };
  const program = ts.createProgram([...files, resolve(root, '.generated/registrations.ts'), ...entries], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: p => p, getCurrentDirectory: () => root, getNewLine: () => '\n'
  }));
  const emit = program.emit();
  if (emit.emitSkipped) throw new Error('TypeScript emit skipped');
  return { sourceModules: files.length, registrationModules: registrationFiles.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; });
}

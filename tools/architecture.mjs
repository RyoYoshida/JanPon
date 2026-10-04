import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { discover } from './discover.mjs';
const forbidden = new Set(['console','window','document','navigator','indexedDB','localStorage','sessionStorage','Audio','AudioContext','fetch','XMLHttpRequest','WebSocket','Date','performance','crypto','globalThis','global','process','setTimeout','setInterval','requestAnimationFrame','eval','Function','require']);
const ranks = { spec: 0, core: 1, registrations: 2, application: 2, adapters: 3, bootstrap: 4 };
export async function architecture(root = process.cwd()) {
  const files = await discover(resolve(root, 'src'), p => p.endsWith('.ts'));
  const errors = [], graph = new Map();
  const program = ts.createProgram(files, { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, lib: ['lib.es2023.d.ts'], allowImportingTsExtensions: true, noEmit: true });
  const checker = program.getTypeChecker();
  for (const file of files) {
    const path = relative(resolve(root, 'src'), file).replaceAll('\\', '/');
    const layer = path === 'spec.ts' ? 'spec' : path.split('/')[0];
    const source = program.getSourceFile(file);
    const edges = []; graph.set(file, edges);
    const report = (node, message) => { const pos = source.getLineAndCharacterOfPosition(node.getStart(source)); errors.push(`${path}:${pos.line + 1}: ${message}`); };
    function visit(node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const target = node.moduleSpecifier.text;
          if (!target.startsWith('.')) report(node, 'External/environment import forbidden in foundation');
          else {
            const full = resolve(dirname(file), target), p = relative(resolve(root, 'src'), full).replaceAll('\\', '/');
            const targetLayer = p === 'spec.ts' ? 'spec' : p.split('/')[0];
            if (!(targetLayer in ranks) || !(layer in ranks) || ranks[targetLayer] > ranks[layer]) report(node, 'Reverse or unknown dependency');
            if (!files.includes(full)) report(node, 'Import outside discovered source modules');
            edges.push(full);
          }
        }
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) report(node, 'Dynamic imports bypass dependency graph');
      if ((layer === 'core' || layer === 'spec') && ts.isIdentifier(node) && forbidden.has(node.text)) report(node, 'Core environment reference');
      if ((layer === 'core' || layer === 'spec') && ts.isPropertyAccessExpression(node) && node.expression.getText(source) === 'Math' && node.name.text === 'random') report(node, 'Global RNG reference');
      if ((layer === 'core' || layer === 'spec') && ts.isElementAccessExpression(node) && node.expression.getText(source) === 'Math') report(node, 'Computed Math access bypasses injected RNG');
      if (ts.isParameter(node) && ((node.type && containsBoolean(node.type)) || isBoolean(checker.getTypeAtLocation(node)))) report(node, 'Boolean parameter forbidden');
      if (ts.isNumericLiteral(node) && layer !== 'spec' && !['0','1'].includes(node.text)) report(node, 'Numeric policy literal outside src/spec.ts');
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.MinusToken && node.left.getText(source) === '1' && ts.isIdentifier(node.right)) report(node, 'Fixed-shape complement expression');
      if (ts.isArrayLiteralExpression(node) && node.elements.length === 2 && node.elements.map(n => n.getText(source)).join(',') === '0,1') report(node, 'Fixed two-item shape');
      if (ts.isSwitchStatement(node) && /axis|agent/i.test(node.expression.getText(source))) report(node, 'Axis/agent switch must use registry');
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  function isBoolean(type) { return !!(type.flags & ts.TypeFlags.BooleanLike) || (type.isUnion?.() && type.types.some(isBoolean)); }
  function containsBoolean(node) { if (node.kind === ts.SyntaxKind.BooleanKeyword) return true; let yes = false; ts.forEachChild(node, child => { if (containsBoolean(child)) yes = true; }); return yes; }
  const active = new Set(), seen = new Set();
  function walk(file) { if (active.has(file)) { errors.push(`Dependency cycle: ${file}`); return; } if (seen.has(file)) return; active.add(file); for (const next of graph.get(file) ?? []) walk(next); active.delete(file); seen.add(file); }
  for (const file of files) walk(file);
  if (errors.length) throw new Error(errors.join('\n'));
  return { modules: files.length, dependencyEdges: [...graph.values()].reduce((sum, edges) => sum + edges.length, 0) };
}

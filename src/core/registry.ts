import { AXIS_MANIFEST } from '../spec.ts';
import type { Prioritized, Registration } from './contracts.ts';

/** Callers filter applicability before collection. Highest priority first; ASCII ID breaks ties. */
export function collect<T extends Prioritized>(entries: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.id || seen.has(entry.id)) throw new Error('duplicate or empty registration ID');
    if (!Number.isSafeInteger(entry.priority)) throw new Error('invalid priority');
    seen.add(entry.id);
  }
  return [...entries].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
export function select<T extends Prioritized>(entries: readonly T[]): T {
  const selected = collect(entries)[0];
  if (!selected) throw new Error('no applicable registration');
  return selected;
}
/** Generic mechanism only; no additive product axis is introduced. */
export function add(entries: readonly (Prioritized & { readonly value: number })[]): number {
  return collect(entries).reduce((total, entry) => {
    const next = total + entry.value;
    if (!Number.isFinite(entry.value) || !Number.isFinite(next)) throw new Error('invalid contribution');
    return next;
  }, 0);
}
export function checkManifest(entries: readonly Registration[]): readonly string[] {
  const expected = new Set<string>(AXIS_MANIFEST.flatMap(axis => axis.ids.map(id => `${axis.axis}:${id}`)));
  const seen = new Set<string>();
  const issues: string[] = [];
  for (const entry of entries) {
    const key = `${entry.axis}:${entry.id}`;
    if (seen.has(key)) issues.push(`duplicate:${key}`);
    seen.add(key);
    if (!expected.has(key)) issues.push(`extra:${key}`);
    if (!Number.isSafeInteger(entry.priority)) issues.push(`priority:${key}`);
    if (!['unimplemented', 'minimal'].includes(entry.status) || (entry.status === 'minimal' && entry.implementation === undefined) || !entry.taskIds.length || entry.taskIds.some(id => !/^T\d+-\d+$/.test(id))) issues.push(`status:${key}`);
  }
  for (const key of expected) if (!seen.has(key)) issues.push(`missing:${key}`);
  return issues.sort();
}

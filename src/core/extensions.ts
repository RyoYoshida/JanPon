import type { Registration } from './contracts.ts';
import { checkManifest } from './registry.ts';
/** Implement an existing planned row exactly once; never shadow an implementation. */
export interface Extension {
  readonly axis: string; readonly id: string; readonly implementation: unknown;
  readonly taskIds: readonly string[]; readonly priority?: number;
}
export function connectExtensions(rows: readonly Registration[], extensions: readonly Extension[]): readonly Registration[] {
  const issues = checkManifest(rows); if (issues.length) throw new Error(issues.join('; '));
  const connected = rows.map(row => ({ ...row }));
  for (const extension of extensions) {
    const row = connected.find(item => item.axis === extension.axis && item.id === extension.id);
    if (!row || row.status !== 'unimplemented' || extension.implementation === undefined) throw new Error(`Invalid extension: ${extension.axis}:${extension.id}`);
    row.implementation = extension.implementation; row.status = 'minimal'; row.taskIds = extension.taskIds;
    row.priority = extension.priority ?? row.priority;
  }
  const invalid = checkManifest(connected); if (invalid.length) throw new Error(invalid.join('; '));
  return connected;
}

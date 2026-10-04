import { SPEC } from '../spec.ts';
import type { Registration } from '../core/contracts.ts';

export const registration: Registration = {
  axis: 'A1', id: 'pointer', priority: SPEC.defaultPriority,
  status: 'minimal', implementation: (host: { bindPointer(): void }) => { host.bindPointer(); return () => {}; }, taskIds: ['T07-04'],
};

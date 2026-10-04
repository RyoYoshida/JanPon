import { SPEC } from '../spec.ts';
import type { Registration } from '../core/contracts.ts';

export const registration: Registration = {
  axis: 'A4', id: 'audio', priority: SPEC.defaultPriority,
  status: 'unimplemented', taskIds: ['T10-04'],
};

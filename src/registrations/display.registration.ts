import type { Output } from '../core/game-contracts.ts';
import { SPEC } from '../spec.ts';
import type { Registration } from '../core/contracts.ts';

export const registration: Registration = {
  axis: 'A4', id: 'display', priority: SPEC.defaultPriority,
  status: 'minimal', implementation: (emit: Output['emit']): Output => ({ id: 'display', priority: SPEC.defaultPriority, emit }), taskIds: ['T07-04'],
};

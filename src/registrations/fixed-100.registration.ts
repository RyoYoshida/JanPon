import { fixedPayout } from '../core/rules.ts';
import type { PayoutPolicy } from '../core/rules.ts';
import { SPEC } from '../spec.ts';
import type { Registration } from '../core/contracts.ts';

export const registration: Registration & { implementation: PayoutPolicy } = {
  axis: 'A3', id: 'fixed-100', priority: SPEC.defaultPriority,
  status: 'minimal', implementation: fixedPayout, taskIds: ['T07-02'],
};

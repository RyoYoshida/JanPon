import { uniformOpponent } from '../core/rules.ts';
import type { OpponentPolicy } from '../core/rules.ts';
import { SPEC } from '../spec.ts';
import type { Registration } from '../core/contracts.ts';

export const registration: Registration & { implementation: OpponentPolicy } = {
  axis: 'A2', id: 'uniform-opponent', priority: SPEC.defaultPriority,
  status: 'minimal', implementation: uniformOpponent, taskIds: ['T07-02'],
};

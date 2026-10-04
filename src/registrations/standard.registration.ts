import type { GameView } from '../core/game-contracts.ts';
import { SPEC } from '../spec.ts';
import type { Registration } from '../core/contracts.ts';

export const registration: Registration = {
  axis: 'A5', id: 'standard', priority: SPEC.defaultPriority,
  status: 'minimal', implementation: (present: (view: GameView) => Promise<void>) => ({ present }), taskIds: ['T07-04'],
};

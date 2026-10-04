import type { GameView } from '../core/game-contracts.ts';
import { SPEC } from '../spec.ts';
import type { Registration } from '../core/contracts.ts';

export const registration: Registration = {
  axis: 'A5', id: 'standard', priority: SPEC.defaultPriority,
  status: 'minimal', implementation: (host: { animate(view: GameView): Promise<void> }) => ({ applicable: () => true, present: (view: GameView) => host.animate(view) }), taskIds: ['T07-04'],
};

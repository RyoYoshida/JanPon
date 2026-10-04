import type { Store } from '../core/contracts.ts';
import type { Ownership } from '../core/game-contracts.ts';
import { SPEC } from '../spec.ts';
import type { Registration } from '../core/contracts.ts';

export const registration: Registration = {
  axis: 'A6', id: 'indexeddb', priority: SPEC.defaultPriority,
  status: 'minimal', implementation: (store: Store<unknown>, ownership: Ownership) => ({ store, ownership }), taskIds: ['T07-03'],
};

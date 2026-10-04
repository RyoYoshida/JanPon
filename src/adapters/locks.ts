import type { Lease, Ownership } from '../core/game-contracts.ts';
import { ENGINE } from '../spec.ts';

/** Keep the Web Locks callback pending for the entire ownership lease. */
export function createOwnership(manager: LockManager): Ownership {
  return {
    acquire: () => new Promise<Lease | null>((resolve, reject) => {
      if (!manager?.request) { reject(new Error('Web Locks unavailable')); return; }
      manager.request(ENGINE.lockName, { mode: 'exclusive', ifAvailable: true }, lock => {
        if (!lock) { resolve(null); return; }
        return new Promise<void>(release => resolve({ release: () => release() }));
      }).catch(reject);
    }),
  };
}

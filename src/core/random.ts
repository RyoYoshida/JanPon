import { ENGINE } from '../spec.ts';
import type { StateRng } from './game-contracts.ts';
export function assertSeed(seed: number): void {
  if (!Number.isSafeInteger(seed) || seed < 1 || seed >= ENGINE.rngModulus) throw new Error('invalid RNG state');
}
export const seededRandom: StateRng = {
  next(state, bound) {
    assertSeed(state);
    if (!Number.isSafeInteger(bound) || bound < 1 || bound > ENGINE.rngDomain) throw new Error('invalid RNG bound');
    const limit = Math.floor(ENGINE.rngDomain / bound) * bound;
    let next = state;
    do { next = (next * ENGINE.rngMultiplier) % ENGINE.rngModulus; } while (next - 1 >= limit);
    return { value: (next - 1) % bound, state: next };
  },
};

import type { Agent, GameView, StateRng } from '../core/game-contracts.ts';
import { SPEC } from '../spec.ts';
export function replayAgent(decisions: readonly number[]): Agent {
  let cursor = 0;
  return { id: 'replay', priority: SPEC.defaultPriority, async decide() {
    const next = decisions[cursor++]; if (next === undefined) throw new Error('Replay exhausted'); return next;
  } };
}
export function randomAgent(rng: StateRng, seed: number): Agent {
  let state = seed;
  return { id: 'random', priority: SPEC.defaultPriority, async decide(view) {
    const next = rng.next(state, view.choices.length); state = next.state; return next.value;
  } };
}
export function recordingAgent(agent: Agent, decisions: number[]): Agent {
  return { id: 'recording', priority: SPEC.defaultPriority, async decide(view) {
    const index = await agent.decide(view); decisions.push(index); return index;
  } };
}
export interface PointerAgent extends Agent { choose(index: number): void; cancel(): void }
export function pointerAgent(): PointerAgent {
  let pending: ((index: number) => void) | null = null;
  return { id: 'pointer', priority: SPEC.defaultPriority,
    decide(_view: GameView) { return new Promise<number>(resolve => { pending = resolve; }); },
    choose(index) { const resolve = pending; pending = null; resolve?.(index); },
    cancel() { const resolve = pending; pending = null; resolve?.(-1); },
  };
}

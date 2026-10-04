import { collect } from '../core/registry.ts';
import type { Agent, GamePorts, GameState, GameView, AppStatus, Lease } from '../core/game-contracts.ts';
import { assertState, copyState, initialState } from '../core/state.ts';
import { publicView } from '../core/view.ts';
import { transition } from '../core/transitions.ts';
import type { Action, Rules } from '../core/transitions.ts';
/** One authoritative application path for pointer input, recorded decisions and unattended agents. */
export class Game {
  status: AppStatus = 'new';
  reason = '';
  private state: GameState | null = null;
  private lease: Lease | null = null;
  private generation = 0;
  private writes = 0;
  private deciding = false;
  private ports: GamePorts;
  private rules: Rules;
  constructor(ports: GamePorts, rules: Rules) { this.ports = ports; this.rules = rules; }
  view(): GameView | null { return this.state ? publicView(this.state) : null; }
  snapshot(): GameState | null { return this.state ? copyState(this.state) : null; }
  private valid(generation: number): boolean { return generation === this.generation && this.status !== 'closed'; }
  private stop(reason: string): void { this.status = 'stopped'; this.reason = reason; }
  private async publish(): Promise<void> {
    const view = this.view(); if (!view) return;
    for (const output of collect(this.ports.outputs)) {
      try { await output.emit({ kind: 'state', view: JSON.parse(JSON.stringify(view)) as GameView }); }
      catch { /* Output refusal cannot modify state, RNG, ownership or successful accounting. */ }
    }
  }
  async start(): Promise<void> {
    if (this.status !== 'new') return;
    this.status = 'busy'; const generation = this.generation;
    try {
      const lease = await this.ports.ownership.acquire();
      if (!this.valid(generation)) { lease?.release(); return; }
      if (!lease) { this.status = 'other-tab'; this.reason = 'Another tab owns the game'; return; }
      this.lease = lease; await this.load();
    } catch (error) { if (this.valid(generation)) this.stop(String(error)); }
  }
  private async load(): Promise<void> {
    const generation = this.generation;
    try {
      const loaded = await this.ports.store.read();
      if (!this.valid(generation)) return;
      if (loaded.kind === 'failed') { this.stop(loaded.reason); return; }
      if (loaded.kind === 'empty') { await this.commit(initialState(this.ports.seed, this.ports.clock.now())); return; }
      assertState(loaded.value); this.state = copyState(loaded.value); this.status = 'ready'; this.reason = ''; await this.publish();
    } catch (error) { if (this.valid(generation)) this.stop(String(error)); }
  }
  async retry(): Promise<void> {
    if (this.status !== 'stopped' || !this.lease) return;
    this.status = 'busy'; await this.load();
  }
  private async commit(candidate: GameState): Promise<void> {
    const generation = this.generation;
    if (!this.lease || !this.valid(generation)) return;
    this.status = 'busy'; this.writes++;
    try {
      assertState(candidate);
      const written = await this.ports.store.write(copyState(candidate));
      if (!this.valid(generation)) return;
      if (written.kind !== 'committed') { this.stop(written.reason); return; }
      this.state = copyState(candidate); this.status = 'ready'; this.reason = ''; await this.publish();
    } catch (error) { if (this.valid(generation)) this.stop(String(error)); }
    finally { this.writes--; this.releaseIfClosed(); }
  }
  private async apply(action: Action): Promise<void> {
    if (this.status !== 'ready' || !this.state) return;
    try {
      const candidate = transition(this.state, action, this.ports.rng, this.rules, this.ports.clock.now());
      if (candidate !== this.state) await this.commit(candidate);
    } catch (error) { this.stop(String(error)); }
  }
  async step(agent: Agent): Promise<void> {
    if (this.status !== 'ready' || !this.state || this.deciding) return;
    const generation = this.generation, revision = this.state.revision, view = publicView(this.state);
    if (!view.choices.length) return;
    this.deciding = true;
    try {
      const index = await agent.decide(view);
      if (!this.valid(generation) || this.status !== 'ready' || this.state.revision !== revision) return;
      if (!Number.isSafeInteger(index) || index < 0 || !view.choices[index]) return;
      // Agent owns its view copy; reconstruct authoritative choices after the await.
      const choice = publicView(this.state).choices[index];
      if (choice) await this.apply(choice);
    } catch (error) { if (this.valid(generation)) this.reason = `Input rejected: ${String(error)}`; }
    finally { this.deciding = false; }
  }
  async settle(revision: number): Promise<void> {
    if (this.state?.phase !== 'result' || this.state.revision !== revision) return;
    await this.apply({ kind: 'advance' });
  }
  private releaseIfClosed(): void { if (this.status === 'closed' && this.writes === 0) this.release(); }
  private release(): void { this.lease?.release(); this.lease = null; }
  close(): void { this.generation++; this.status = 'closed'; if (this.writes === 0) this.release(); }
}

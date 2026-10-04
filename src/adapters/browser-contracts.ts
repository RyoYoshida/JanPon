import type { Choice, GameView, Output } from '../core/game-contracts.ts';
import type { Presentation } from '../application/progress.ts';
/** Browser-side capabilities only; no state, RNG, store or accounting authority. */
export interface BrowserHost {
  document: Document; window: Window;
  view(): GameView | null;
  request(choice: Choice): void;
  bindPointer(): void;
  show(): void;
  animate(view: GameView): Promise<void>;
  finishPresentation(): Promise<void>;
  motionMode(): string;
  setMotionMode(mode: string): void;
}
export type InputFactory = (host: BrowserHost) => (() => void);
export type OutputFactory = (host: BrowserHost) => Output & { dispose?(): void };
export interface PresentationPolicy extends Presentation { applicable(mode: string): boolean; dispose?(): void }
export type PresentationFactory = (host: BrowserHost) => PresentationPolicy;

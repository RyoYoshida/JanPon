import { SPEC } from '../spec.ts';
import type { AppStatus, GameView, Hand } from '../core/game-contracts.ts';

/** Visual-only scene names. These are not stored phases or gameplay state. */
export type CenterScene = 'loading' | 'saving' | 'waiting' | 'choosing' | 'draw' | 'draw-ready'
  | 'win' | 'loss' | 'roulette' | 'payout' | 'game-over' | 'stopped' | 'other-tab' | 'closed';
const handPaths: Record<Hand, readonly string[]> = {
  rock: ['M22 39V26q0-8 8-8h35q9 0 9 9v26q0 15-14 20H39Q22 66 22 51V39Z', 'M22 39h34q8 0 8 9v5M34 20v17m12-17v17m12-17v17'],
  scissors: ['M37 43 26 15q-3-8 4-11 6-2 9 6l11 27 9-27q3-8 9-5 6 2 4 10L62 46h7q10 0 10 10v7q0 18-20 22H42Q27 80 27 65V52q0-9 10-9Z', 'M37 43 53 52q7 4 3 10-3 5-10 1l-8-5'],
  paper: ['M24 48V22q0-7 6-7t6 7v23-32q0-7 6-7t6 7v30-28q0-7 6-7t6 7v29-22q0-6 6-6t6 6v39q0 21-22 25H40Q26 80 22 68L12 49q-4-7 2-10 6-3 10 9Z', ''],
};
const icons = {
  coin: 'M29 16a13 13 0 1 1-26 0 13 13 0 0 1 26 0ZM14 9h4v14h-4Z',
  hand: 'M9 17V9a2 2 0 0 1 4 0v7-11a2 2 0 0 1 4 0v11-9a2 2 0 0 1 4 0v10-6a2 2 0 0 1 4 0v11q0 8-9 8H13Q8 28 6 24l-3-6q-1-3 2-3l4 5',
  draw: 'M6 11h20M6 21h20',
  win: 'm16 3 4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1Z',
  loss: 'm8 8 16 16M24 8 8 24',
  flag: 'M7 28V4h19l-4 6 4 6H7',
  repeat: 'M25 12A10 10 0 1 0 25 22M25 5v8h-8',
  saveError: 'M6 3h17l4 4v22H5V3ZM10 3v8h12V3m-11 15 10 10m0-10L11 25',
  tabs: 'M4 5h18v19H4ZM10 1h18v19',
  hourglass: 'M7 3h18M7 29h18M9 3v7l14 12v7M23 3v7L9 22v7',
  blocked: 'M28 16a12 12 0 1 1-24 0 12 12 0 0 1 24 0ZM7 7l18 18',
};
export type CenterIcon = keyof typeof icons;
function iconPath(name: CenterIcon): string {
  return `<path d="${icons[name]}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
}
export function controlIcon(name: CenterIcon): string {
  return `<svg viewBox="0 0 32 32" aria-hidden="true">${iconPath(name)}</svg>`;
}
function hand(hand: Hand, className: string): string {
  return `<g class="center-hand ${className}" data-center-hand="${hand}"><rect width="95" height="95" fill="url(#center-led)" mask="url(#center-${hand})"/></g>`;
}
function trio(className: string): string {
  return `<g class="${className}">${SPEC.hands.map(value => hand(value, `center-${value}`)).join('')}</g>`;
}
export function sceneFor(view: GameView | null, status: AppStatus): CenterScene {
  if (status === 'stopped' || status === 'other-tab' || status === 'closed') return status;
  if (!view || status === 'new') return 'loading';
  if (status === 'busy') return 'saving';
  if (view.phase === 'game-over') return 'game-over';
  if (view.phase === 'idle') return 'waiting';
  if (view.phase === 'choosing') return view.result?.outcome === 'draw' ? 'draw-ready' : 'choosing';
  return view.result?.outcome ?? 'loading';
}

/** Pure markup from the public view: no RNG, stored opponent, payout or scheduling access. */
export function centralScene(scene: CenterScene, view: GameView | null): string {
  const masks = SPEC.hands.map(value => `<mask id="center-${value}"><path d="${handPaths[value][0]}" fill="white"/><path d="${handPaths[value][1]}" fill="none" stroke="black" stroke-width="3" stroke-linecap="round"/></mask>`).join('');
  let content = '';
  if (scene === 'waiting') content = trio('center-cycle');
  if (scene === 'choosing' || scene === 'draw-ready') content = trio('center-cycle');
  if (['draw', 'win', 'loss', 'roulette'].includes(scene) && view?.result) {
    content = hand(view.result.opponent, 'center-result-hand');
    if (scene === 'roulette') content += '<circle class="center-orbit" cx="110" cy="72" r="62" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="14 18"/>';
  }
  if (scene === 'payout') content = '<g class="center-coins"><ellipse cx="110" cy="65" rx="29" ry="11"/><path d="M81 65v20c0 15 58 15 58 0V65M81 75c0 15 58 15 58 0M81 85c0 15 58 15 58 0"/></g>';
  const notice: Partial<Record<CenterScene, CenterIcon>> = { loading: 'hourglass', saving: 'hourglass', 'game-over': 'flag', stopped: 'saveError', 'other-tab': 'tabs', closed: 'blocked' };
  const noticeIcon = notice[scene];
  if (noticeIcon) content = `<g class="center-notice" transform="translate(78 38) scale(2)">${iconPath(noticeIcon)}</g>`;
  if (scene === 'loading' || scene === 'saving') content += '<g class="center-progress"><circle cx="94" cy="135" r="3"/><circle cx="110" cy="135" r="3"/><circle cx="126" cy="135" r="3"/></g>';
  if (scene === 'saving') content += '<path d="M76 153h68" stroke="currentColor" stroke-width="2"/>';
  return `<svg class="center-scene" viewBox="0 0 220 200" aria-hidden="true"><defs><pattern id="center-led" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.35" fill="currentColor"/></pattern>${masks}</defs>${content}</svg>`;
}

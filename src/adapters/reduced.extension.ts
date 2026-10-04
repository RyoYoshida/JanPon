import { settingsControls } from './settings-controls.ts';
import { EFFECTS } from '../spec.ts';
import type { Extension } from '../core/extensions.ts';
import type { BrowserHost, PresentationPolicy } from './browser-contracts.ts';
/** Reduced movement changes only presentation of already committed public results. */
export function createReducedPresentation(host: BrowserHost): PresentationPolicy {
  const root = host.document;
  const machine = root.querySelector<HTMLElement>('.machine');
  const controls = settingsControls(root);
  if (!machine) throw new Error('Missing presentation controls');
  const button = root.createElement('button');
  button.id = 'motion-toggle'; button.className = 'tool'; button.type = 'button';
  button.setAttribute('aria-keyshortcuts', 'Enter Space');
  button.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="m6 16 7-9v18Zm13-9h4v18h-4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  const style = root.createElement('style');
  style.textContent = '.machine[data-motion="reduced"] .lamp{transition:none}.tool[aria-pressed="true"]{outline:2px solid currentColor;outline-offset:2px}';
  root.head.append(style); controls.append(button);
  let disposed = false, manual = false;
  const media = host.window.matchMedia?.('(prefers-reduced-motion: reduce)');
  function apply(mode: string): void {
    if (disposed) return;
    host.setMotionMode(mode); machine!.dataset.motion = mode;
    const reduced = mode === 'reduced';
    button.setAttribute('aria-pressed', String(reduced));
    button.setAttribute('aria-label', reduced ? '動き控えめ。オン。押すと通常の動き' : '動き控えめ。オフ。押すと動き控えめ');
    if (reduced && host.view()?.result) void host.finishPresentation();
  }
  function toggle(event: Event): void {
    event.stopPropagation(); manual = true;
    apply(host.motionMode() === 'reduced' ? 'standard' : 'reduced');
  }
  function changed(): void { if (!manual) apply(media?.matches ? 'reduced' : 'standard'); }
  button.addEventListener('click', toggle);
  media?.addEventListener('change', changed);
  apply(media?.matches ? 'reduced' : 'standard');
  return {
    applicable: mode => mode === 'reduced',
    async present() { if (!disposed) await host.finishPresentation(); },
    dispose() {
      disposed = true; button.removeEventListener('click', toggle); media?.removeEventListener('change', changed);
      button.remove(); style.remove();
    },
  };
}
export const extension: Extension = {
  axis: 'A5', id: 'reduced', priority: EFFECTS.selectedPriority,
  implementation: createReducedPresentation, taskIds: ['T08-01'],
};

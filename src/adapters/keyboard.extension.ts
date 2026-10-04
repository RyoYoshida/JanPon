import type { BrowserHost } from './browser-contracts.ts';
import type { Hand } from '../core/game-contracts.ts';
import type { Extension } from '../core/extensions.ts';

const shortcuts: Record<string, Hand> = { r: 'rock', s: 'scissors', p: 'paper' };
const options = { capture: true };

/** Focused controls use Enter/Space; R/S/P select hands only, never insert a coin. */
export function installKeyboard(host: BrowserHost): () => void {
  const root = host.document, held = new Set<string>(), suppressed = new Set<string>();
  let composing = false;
  const help = root.createElement('p');
  help.id = 'keyboard-help'; help.className = 'sr-only';
  help.textContent = 'Tabで操作を選び、Enterまたはスペースで実行します。手を選べるときはRでグー、Sでチョキ、Pでパー。投入はコイン周辺を選んで実行します。次の操作の前にキーを離してください。';
  root.body.append(help);
  const attributes: { element: Element; name: string; previous: string | null }[] = [];
  function decorate(element: Element, name: string, value: string): void {
    attributes.push({ element, name, previous: element.getAttribute(name) });
    element.setAttribute(name, value);
  }
  const machine = root.querySelector('.machine');
  if (machine) decorate(machine, 'aria-describedby', [machine.getAttribute('aria-describedby'), help.id].filter(Boolean).join(' '));
  root.querySelectorAll<HTMLButtonElement>('.machine button').forEach(button => {
    const key = Object.keys(shortcuts).find(value => shortcuts[value] === button.dataset.hand);
    decorate(button, 'aria-keyshortcuts', key ? `Enter Space ${key.toUpperCase()}` : 'Enter Space');
  });
  function key(event: KeyboardEvent): string { return event.key === 'Spacebar' ? ' ' : event.key.toLowerCase(); }
  function relevant(value: string): boolean { return value === 'enter' || value === ' ' || Object.hasOwn(shortcuts, value); }
  function editable(target: Element | null): boolean {
    return !!target?.closest?.('input, textarea, select, [role="textbox"]') || !!(target as HTMLElement | null)?.isContentEditable;
  }
  function onKeyDown(event: KeyboardEvent): void {
    const value = key(event), token = event.code || value;
    const repeated = held.has(token) || event.repeat; held.add(token);
    if (!relevant(value)) return;
    const target = event.target as Element | null;
    const hand = shortcuts[value];
    const button = target?.closest?.('button') as HTMLButtonElement | null;
    const focused = button && root.activeElement === button && machine?.contains(button);
    if (!hand && !focused) return;
    if (composing || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || editable(target) || event.defaultPrevented) {
      if (!hand && focused) { event.preventDefault(); suppressed.add(token); }
      return;
    }
    // Suppress keydown and keyup native clicks, including repeats without a reliable repeat flag.
    event.preventDefault(); suppressed.add(token);
    if (repeated) return;
    if (hand) host.request({ kind: 'hand', hand });
    else if (button && !button.disabled && !button.hidden && !button.closest('[hidden], [inert]')) button.click();
  }
  function onKeyUp(event: KeyboardEvent): void {
    const token = event.code || key(event); held.delete(token);
    if (suppressed.delete(token)) event.preventDefault();
  }
  function compositionStart(): void { composing = true; }
  function compositionEnd(): void { composing = false; }
  // Do not clear held keys on blur/render: a missing keyup must fail closed until a release.
  root.addEventListener('keydown', onKeyDown, options);
  root.addEventListener('keyup', onKeyUp, options);
  root.addEventListener('compositionstart', compositionStart, options);
  root.addEventListener('compositionend', compositionEnd, options);
  return () => {
    root.removeEventListener('keydown', onKeyDown, options);
    root.removeEventListener('keyup', onKeyUp, options);
    root.removeEventListener('compositionstart', compositionStart, options);
    root.removeEventListener('compositionend', compositionEnd, options);
    held.clear(); suppressed.clear(); help.remove();
    for (const { element, name, previous } of attributes) {
      if (previous === null) element.removeAttribute(name); else element.setAttribute(name, previous);
    }
  };
}
export const extension: Extension = { axis: 'A1', id: 'keyboard', implementation: installKeyboard, taskIds: ['T08-01'] };

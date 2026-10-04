/** Separate normal-flow icon row keeps optional controls outside the coin hit target. */
export function settingsControls(root: Document): HTMLElement {
  const existing = root.querySelector<HTMLElement>('.settings-controls');
  if (existing) return existing;
  const face = root.querySelector<HTMLElement>('.face'), state = root.querySelector<HTMLElement>('.state-controls');
  if (!face || !state) throw new Error('Missing settings container');
  const controls = root.createElement('div');
  controls.className = 'settings-controls'; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', '音と動きの設定');
  controls.style.cssText = 'display:flex;justify-content:center;gap:12px;margin-top:16px';
  face.insertBefore(controls, state);
  return controls;
}

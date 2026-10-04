/** Normal-flow settings sit below the cabinet, outside its face and play targets. */
export function settingsControls(root: Document): HTMLElement {
  const existing = root.querySelector<HTMLElement>('.settings-controls');
  if (existing) return existing;
  const shell = root.querySelector<HTMLElement>('.game-shell');
  if (!shell) throw new Error('Missing settings container');
  const controls = root.createElement('div');
  controls.className = 'settings-controls'; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', '音と動きの設定');
  shell.append(controls);
  return controls;
}

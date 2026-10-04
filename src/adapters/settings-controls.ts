/** Recessed settings sit in the red lower apron, outside the white face and play targets. */
export function settingsControls(root: Document): HTMLElement {
  const existing = root.querySelector<HTMLElement>('.settings-controls');
  if (existing) return existing;
  const machine = root.querySelector<HTMLElement>('.machine');
  if (!machine) throw new Error('Missing settings container');
  const controls = root.createElement('div');
  controls.className = 'settings-controls'; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', '音と動きの設定');
  machine.append(controls);
  return controls;
}

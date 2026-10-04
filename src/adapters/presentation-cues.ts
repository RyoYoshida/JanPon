/** Internal, document-scoped presentation notifications. No gameplay or clock authority. */
type Cue = 'draw-restart';
const listeners = new WeakMap<Document, Set<(cue: Cue) => void>>();
export function listenPresentationCue(root: Document, listener: (cue: Cue) => void): () => void {
  let group = listeners.get(root);
  if (!group) { group = new Set(); listeners.set(root, group); }
  group.add(listener);
  return () => { group!.delete(listener); if (!group!.size) listeners.delete(root); };
}
/** The display's existing hold completion calls this before restarting the hand scene. */
export function presentationCue(root: Document, cue: Cue): void {
  for (const listener of listeners.get(root) ?? []) {
    try { listener(cue); } catch { /* Audio refusal cannot delay or reject visual progress. */ }
  }
}

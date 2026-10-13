/**
 * Stub for the designer hand-off (Task 13 replaces this file).
 *
 * Why it exists now: the story's buttons must already prove the lazy
 * hand-off works (scroll to #designer, dynamic import, openDesigner) so the
 * real designer drops in without touching the story.
 */
export function openDesigner(root, { mode = 'capture' } = {}) {
  root.dataset.mode = mode;
  root.innerHTML = '<p class="designer-stub" role="status">Designer loading…</p>';
  return {
    destroy() { root.innerHTML = ''; delete root.dataset.mode; },
  };
}

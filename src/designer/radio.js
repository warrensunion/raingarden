/**
 * Arrow keys for a group of role="radio" buttons (storm cards, region, slope
 * preset, grow-in season). WHY: a radio group is one tab stop that arrows walk
 * through (WAI-ARIA radio group pattern); the buttons stay real buttons, so
 * click, Enter and Space already pick.
 */
export function radioKeys(group, selector, onPick) {
  const onKey = (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    const items = [...group.querySelectorAll(selector)];
    if (!items.length) return;
    e.preventDefault();
    const cur = items.findIndex((x) => x === document.activeElement || x.getAttribute('aria-checked') === 'true');
    const next = items[(Math.max(0, cur) + d + items.length) % items.length];
    onPick(next);
    // the pick may re-render the group: focus the item that now stands in its place
    const again = [...group.querySelectorAll(selector)].find((x) => x.getAttribute('aria-checked') === 'true') || next;
    again.focus();
  };
  group.addEventListener('keydown', onKey);
  return () => group.removeEventListener('keydown', onKey);
}

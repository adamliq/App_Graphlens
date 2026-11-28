/**
 * Shared keyboard behaviour for the canvas right-click menus (1.25.0):
 * focus the first item when the menu opens, and move between items with
 * ArrowUp/ArrowDown/Home/End (wrapping). Escape is already handled by the
 * Popover's own onRequestClose.
 */
export function focusFirstMenuItem(rootSelector) {
  // After the Popover has rendered its content.
  window.setTimeout(() => {
    const first = document.querySelector(`${rootSelector} [role="menuitem"]:not([aria-disabled="true"])`);
    if (first) first.focus();
  }, 0);
}

export function handleMenuArrowKeys(event) {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const items = Array.from(event.currentTarget.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])'));
  if (items.length === 0) return;
  event.preventDefault();
  const index = items.indexOf(document.activeElement);
  let next;
  if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = items.length - 1;
  else if (event.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % items.length;
  else next = index <= 0 ? items.length - 1 : index - 1;
  items[next].focus();
}

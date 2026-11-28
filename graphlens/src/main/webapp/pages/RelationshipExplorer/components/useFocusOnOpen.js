import { useEffect } from 'react';

/**
 * Moves focus to `ref.current` once a dialog has opened (1.25.0). The
 * component library's own `initialFocus={ref}` ran before these refs were
 * attached - measured live, focus stayed on the toolbar button behind the
 * dialog - so focus is set here, after the dialog has rendered.
 */
export default function useFocusOnOpen(open, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => {
      const el = ref.current;
      if (el && typeof el.focus === 'function') el.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [open, ref]);
}

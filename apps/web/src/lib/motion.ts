/**
 * Shared motion tokens — the single source of truth for animation feel.
 *
 * Curves (Emil Kowalski's strong curves — built-in CSS easings are too weak):
 *   EASE_OUT     entrances/exits — starts fast, feels responsive
 *   EASE_IN_OUT  moving/morphing on screen
 * The same curves exist as CSS custom properties in globals.css
 * (--ease-out / --ease-in-out) for non-framer surfaces.
 */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

/** Standard entrance: fade-up over 0.3s on the strong ease-out. */
export const ENTER = { duration: 0.3, ease: EASE_OUT } as const;

/** Quicker entrance for high-frequency, nav-reachable surfaces. */
export const ENTER_FAST = { duration: 0.2, ease: EASE_OUT } as const;

/** Celebration spring — rare success moments only (Apple-style, subtle bounce). */
export const SPRING_CELEBRATE = { type: "spring", duration: 0.5, bounce: 0.2 } as const;

/**
 * Stagger step (40ms — inside the 30–80ms band). Always capped: stagger is
 * decorative and must never block interaction on long lists.
 */
export const STAGGER_STEP = 0.04;
export function staggerDelay(index: number, cap = 10): number {
  return Math.min(index, cap) * STAGGER_STEP;
}

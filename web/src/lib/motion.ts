/**
 * HizmetSearch motion presets.
 *
 * House style: refined, subtle springs — never bouncy. Most UI lives on
 * `spring.soft`. Use `spring.snappy` for toggles and tabs, `spring.gentle`
 * for layout changes (sidebars, panels). For opacity-only fades, use the
 * `fade` tween presets which are cheaper.
 *
 * Every duration is capped to ~350ms so the interface never feels slow.
 */

import type { Transition, Variants } from "framer-motion";

export const spring = {
  /** Default UI interaction — ≈ 300ms to settle. */
  soft: { type: "spring", stiffness: 210, damping: 32, mass: 0.9 } satisfies Transition,
  /** Quick toggles, segmented controls, small state changes. */
  snappy: { type: "spring", stiffness: 320, damping: 28, mass: 0.8 } satisfies Transition,
  /** Layout morphs — sidebar collapse, panel resize, reflow. */
  gentle: { type: "spring", stiffness: 150, damping: 36, mass: 1 } satisfies Transition,
};

export const fade = {
  quick: { duration: 0.12, ease: [0.4, 0, 0.2, 1] } satisfies Transition,
  smooth: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } satisfies Transition,
  slow: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } satisfies Transition,
};

/** Staggered reveal for lists of cards, messages, history entries. */
export const stagger = {
  listItem: { delayChildren: 0.04, staggerChildren: 0.05 },
  listItemFast: { delayChildren: 0, staggerChildren: 0.03 },
};

// ── Reusable variants ─────────────────────────────────────────

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: spring.soft },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: fade.smooth },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  show: { opacity: 1, scale: 1, transition: spring.snappy },
};

/** Parent variant for staggered children (result cards, history items). */
export const staggerParent: Variants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: stagger.listItem,
  },
};

/** Page-transition variant — small vertical drift + fade. */
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.1, ease: [0.4, 0, 1, 1] },
  },
};

/** Modal/popover entrance. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 4 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: spring.snappy,
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: fade.quick,
  },
};

/**
 * Layer id generator.
 *
 * Format matches the one already used in the legacy editor
 * (`design-editor.tsx`): `el_<timestamp>_<rand4>`. This keeps legacy
 * DOM ids and scene layer ids indistinguishable, so round-tripping
 * HTML through the scene graph doesn't churn ids.
 */

export function newLayerId(prefix = "el"): string {
  // Avoid Date.now() collisions within the same ms by mixing in a short random suffix.
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${Date.now()}_${rand}`;
}

/** Root group id is stable so selectors can target it without lookup. */
export const ROOT_GROUP_ID = "scene_root";

/** Regex for layer ids we recognize as "ours" (generated vs. hand-written). */
export const LAYER_ID_RE = /^el_\d+_[a-z0-9]{2,8}$/;

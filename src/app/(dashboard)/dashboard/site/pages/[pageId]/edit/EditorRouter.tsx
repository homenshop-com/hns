"use client";

/**
 * EditorRouter — paradigm-aware factory for the design editor.
 *
 * The two layout paradigms (absolute Figma/PowerPoint vs. responsive
 * block-flow) are being split into two dedicated editors so each can
 * carry a single, guard-free set of invariants instead of the current
 * "one promote-to-absolute rule + N section guards scattered across
 * store/parse/sync/serialize". See plan: mutable-baking-falcon.md.
 *
 * Phase 2 (this file's initial form) is a pass-through seam: BOTH
 * branches render the existing `DesignEditor`, so behavior is identical
 * to before. The branch point now exists and is driven by the resolved
 * `editorMode`, so subsequent phases can swap in `<ResponsiveFlowEditor>`
 * (Phase 3) and `<LegacyAbsoluteEditor>` (Phase 4) one at a time without
 * touching the server `page.tsx` load/save plumbing.
 */

import type { ComponentProps } from "react";
import DesignEditor from "./design-editor";

/** Resolved editing paradigm for this site. */
export type EditorMode = "absolute" | "flow";

type EditorRouterProps = ComponentProps<typeof DesignEditor> & {
  /** Resolved in the server parent: `Site.editorMode` if set, else the
   *  legacy `isResponsiveTemplate` heuristic mapped to "flow"/"absolute". */
  editorMode: EditorMode;
};

export default function EditorRouter({ editorMode, ...props }: EditorRouterProps) {
  // Phase 2: both paradigms render the legacy unified editor. The seam is
  // in place; Phases 3/4 replace each branch with its dedicated editor.
  // `editorMode` is forwarded so the editor's device toggle + mode badge key
  // on the resolved paradigm (honoring any Site.editorMode admin override)
  // rather than the raw isResponsiveTemplate heuristic.
  if (editorMode === "flow") {
    // TODO(Phase 3): return <ResponsiveFlowEditor {...props} />;
    return <DesignEditor {...props} editorMode={editorMode} />;
  }
  // TODO(Phase 4): return <LegacyAbsoluteEditor {...props} />;
  return <DesignEditor {...props} editorMode={editorMode} />;
}

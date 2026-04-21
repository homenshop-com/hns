/**
 * InspectorPanel — right-side inspector with three tabs (디자인 / 레이어 /
 * 인터랙션), matching the Claude Design "Editor Canvas.html" prototype.
 *
 * - 디자인 tab: live selection header (icon + name + layer-type badge +
 *   ancestor breadcrumb) + editable position / size / rotation. Wired
 *   to the Zustand scene store — edits flow through the same setFrame /
 *   rename actions that the canvas drag handlers use, so undo/redo
 *   (zundo) captures them automatically.
 * - 레이어 tab: wraps the existing LayerPanel component.
 * - 인터랙션 tab: placeholder (no trigger/action backend yet).
 *
 * Typography / fill / border / effect sections are **read-only visual
 * scaffolding** in this first pass — they preview the Figma design but
 * don't yet mutate the scene. Wiring them to the serializer requires
 * extending LayerStyle with typography tokens, which is a separate job.
 */

"use client";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  useEditorStore,
  selectRoot,
  selectSelectedId,
} from "../store/editor-store";
import type { Layer, LayerId } from "@/lib/scene";

const LayerPanel = lazy(() => import("./LayerPanel"));

type Tab = "design" | "layers" | "proto";

/* ───── Helpers — walk the scene ─────────────────────────────────── */

function findLayerAndPath(
  root: { id: string; name: string; type: string; children?: Layer[] },
  id: LayerId | null,
  path: Array<{ id: string; name: string; type: string }> = [],
): { layer: Layer | null; path: Array<{ id: string; name: string; type: string }> } {
  if (!id) return { layer: null, path: [] };
  if (root.id === id) return { layer: root as unknown as Layer, path: [...path, root] };
  if (Array.isArray(root.children)) {
    for (const child of root.children) {
      const withChild = [...path, root];
      if (child.id === id) return { layer: child, path: [...withChild, child] };
      if (Array.isArray((child as { children?: Layer[] }).children)) {
        const deeper = findLayerAndPath(
          child as unknown as Parameters<typeof findLayerAndPath>[0],
          id,
          withChild,
        );
        if (deeper.layer) return deeper;
      }
    }
  }
  return { layer: null, path: [] };
}

/** Map internal layer type → Korean label + Font Awesome icon. */
function layerMeta(type: string): { label: string; icon: string; color: string } {
  switch (type) {
    case "group":   return { label: "GROUP",   icon: "fa-folder",       color: "#a897ff" };
    case "section": return { label: "SECTION", icon: "fa-table-cells-large", color: "#5be5b3" };
    case "text":    return { label: "TEXT",    icon: "fa-font",         color: "#6ea8ff" };
    case "image":   return { label: "IMAGE",   icon: "fa-image",        color: "#f4b66a" };
    case "box":     return { label: "BOX",     icon: "fa-square",       color: "#8a8fa3" };
    case "inline":  return { label: "INLINE",  icon: "fa-i-cursor",     color: "#c6c9d6" };
    case "board":   return { label: "BOARD",   icon: "fa-clipboard-list", color: "#ff8bb1" };
    case "product": return { label: "PRODUCT", icon: "fa-bag-shopping", color: "#f4b66a" };
    case "menu":    return { label: "MENU",    icon: "fa-bars",         color: "#c6c9d6" };
    default:        return { label: type.toUpperCase(), icon: "fa-square", color: "#8a8fa3" };
  }
}

/* ───── Component ────────────────────────────────────────────────── */

interface Props {
  /** Null when editor-v2 is disabled — then we render legacy LayerPanel-less state. */
  enabled: boolean;
}

export default function InspectorPanel({ enabled }: Props) {
  const [tab, setTab] = useState<Tab>("design");
  const [selectedId, setSelectedId] = useState<LayerId | null>(null);
  // Subscribe to selection + scene changes.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    setSelectedId(useEditorStore.getState().selectedId);
    return useEditorStore.subscribe((s) => {
      setSelectedId((prev) => (prev === s.selectedId ? prev : s.selectedId));
      setTick((t) => t + 1);
    });
  }, [enabled]);

  const { layer, path } = useMemo(() => {
    const root = selectRoot(useEditorStore.getState());
    return findLayerAndPath(
      root as unknown as Parameters<typeof findLayerAndPath>[0],
      selectedId,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, tick]);

  return (
    <aside className="inspector-rail" aria-label="인스펙터">
      {/* Tabs */}
      <div className="ins-tabs" role="tablist">
        {([
          ["design", "디자인"],
          ["layers", "레이어"],
          ["proto",  "인터랙션"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`ins-tab${tab === id ? " active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="ins-scroll">
        {tab === "design" && (
          <DesignTab layer={layer} path={path} />
        )}

        {tab === "layers" && (
          <Suspense fallback={<div className="ins-empty-small">로딩…</div>}>
            <LayerPanel />
          </Suspense>
        )}

        {tab === "proto" && (
          <div className="ins-empty">
            <div className="ins-empty-icon">
              <i className="fa-solid fa-bolt" aria-hidden />
            </div>
            <div className="ins-empty-title">인터랙션 없음</div>
            <div className="ins-empty-sub">
              호버·클릭·스크롤에 반응하는
              <br />
              애니메이션을 추가하세요
            </div>
            <button type="button" className="ins-empty-btn" disabled>
              <i className="fa-solid fa-plus" aria-hidden /> 새 인터랙션
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ───── Design tab ───────────────────────────────────────────────── */

interface DesignTabProps {
  layer: Layer | null;
  path: Array<{ id: string; name: string; type: string }>;
}

function DesignTab({ layer, path }: DesignTabProps) {
  if (!layer) {
    return (
      <div className="ins-empty">
        <div className="ins-empty-icon">
          <i className="fa-solid fa-arrow-pointer" aria-hidden />
        </div>
        <div className="ins-empty-title">선택된 요소 없음</div>
        <div className="ins-empty-sub">
          캔버스에서 요소를 클릭하거나
          <br />
          레이어 탭에서 선택하세요
        </div>
      </div>
    );
  }

  const meta = layerMeta(layer.type);
  const frame = layer.frame ?? { x: 0, y: 0, w: 0, h: 0 };
  const rotate = Math.round(layer.transform?.rotate ?? 0);

  return (
    <>
      <SelectionHeader layer={layer} path={path} meta={meta} />

      <PositionSizeSection
        frame={frame}
        rotate={rotate}
        layerId={layer.id}
        disabled={layer.type === "section" || layer.type === "inline"}
      />

      {/* Typography / Fill / Border / Effect / Interaction — visual stubs */}
      <Section title="타이포그래피">
        <ReadOnlyRow icon="fa-font" label="Pretendard" meta="Variable" />
        <ReadOnlyRow icon="fa-text-height" label="Semibold 16 / 24" meta="" />
      </Section>

      <Section title="채우기" onAdd>
        <SwatchRow color="#1a3a6b" alpha="100%" />
      </Section>

      <Section title="테두리" onAdd>
        <SwatchRow color="#FFFFFF" alpha="67%" />
        <div className="ins-prop-row">
          <PropField label="두께" value="1.5" unit="px" />
          <PropField label="⌒" value="4" unit="px" />
        </div>
      </Section>

      <Section title="이펙트" onAdd>
        <div className="ins-effect-row">
          <span className="ins-effect-swatch" />
          <div className="ins-effect-label">호버 글로우</div>
          <div className="ins-effect-meta">Y·4 · 10</div>
        </div>
      </Section>

      <Section title="인터랙션" onAdd>
        <div className="ins-interaction-row">
          <span className="ins-interaction-icon">
            <i className="fa-solid fa-link" aria-hidden />
          </span>
          <div className="ins-interaction-main">
            <div className="ins-interaction-top">클릭 시</div>
            <div className="ins-interaction-sub">→ #{layer.id}</div>
          </div>
          <i className="fa-solid fa-ellipsis ins-interaction-more" aria-hidden />
        </div>
      </Section>
    </>
  );
}

/* ───── Sub-components ───────────────────────────────────────────── */

function SelectionHeader({
  layer,
  path,
  meta,
}: {
  layer: Layer;
  path: Array<{ id: string; name: string; type: string }>;
  meta: { label: string; icon: string; color: string };
}) {
  const rename = useEditorStore((s) => s.rename);
  const [draft, setDraft] = useState(layer.name);
  useEffect(() => setDraft(layer.name), [layer.id, layer.name]);

  return (
    <header className="ins-sel-header">
      <div className="ins-sel-row">
        <div className="ins-sel-icon" style={{ color: meta.color }}>
          <i className={`fa-solid ${meta.icon}`} aria-hidden />
        </div>
        <input
          className="ins-sel-name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== layer.name) rename(layer.id, draft || layer.name);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(layer.name);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="ins-sel-badge">{meta.label}</span>
      </div>
      {path.length > 1 && (
        <div className="ins-sel-path">
          {path.slice(-4).map((p, i, arr) => (
            <span key={p.id} className="ins-sel-seg">
              <span className={i === arr.length - 1 ? "cur" : ""}>
                {p.name}
              </span>
              {i < arr.length - 1 && (
                <i className="fa-solid fa-chevron-right ins-sel-chev" aria-hidden />
              )}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}

interface PosProps {
  frame: { x: number; y: number; w: number; h: number };
  rotate: number;
  layerId: LayerId;
  disabled: boolean;
}

function PositionSizeSection({ frame, rotate, layerId, disabled }: PosProps) {
  const setFrame = useEditorStore((s) => s.setFrame);
  const setTransform = useEditorStore((s) => s.setTransform);

  const commitFrame = (patch: Partial<{ x: number; y: number; w: number; h: number }>) => {
    if (disabled) return;
    const cleaned: typeof patch = {};
    for (const k of ["x", "y", "w", "h"] as const) {
      if (patch[k] !== undefined && Number.isFinite(patch[k])) cleaned[k] = patch[k];
    }
    if (Object.keys(cleaned).length > 0) setFrame(layerId, cleaned);
  };

  return (
    <Section title="위치 · 크기">
      <div className="ins-prop-grid">
        <EditableProp
          label="X"
          value={frame.x}
          unit="px"
          onCommit={(v) => commitFrame({ x: v })}
          disabled={disabled}
        />
        <EditableProp
          label="Y"
          value={frame.y}
          unit="px"
          onCommit={(v) => commitFrame({ y: v })}
          disabled={disabled}
        />
        <EditableProp
          label="W"
          value={frame.w}
          unit="px"
          onCommit={(v) => commitFrame({ w: v })}
        />
        <EditableProp
          label="H"
          value={frame.h}
          unit="px"
          onCommit={(v) => commitFrame({ h: v })}
        />
        <EditableProp
          label="⟳"
          value={rotate}
          unit="°"
          onCommit={(v) => setTransform(layerId, { rotate: v })}
        />
        <EditableProp label="◱" value={0} unit="°" onCommit={() => {}} disabled />
      </div>
    </Section>
  );
}

function EditableProp({
  label,
  value,
  unit,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  unit: string;
  onCommit(value: number): void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(Math.round(value)));
  useEffect(() => setDraft(String(Math.round(value))), [value]);

  return (
    <div className={`ins-prop${disabled ? " disabled" : ""}`}>
      <label>{label}</label>
      <input
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d.\-]/g, ""))}
        onBlur={() => {
          const n = parseFloat(draft);
          if (Number.isFinite(n)) onCommit(n);
          else setDraft(String(Math.round(value)));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(String(Math.round(value)));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <span className="unit">{unit}</span>
    </div>
  );
}

function Section({
  title,
  onAdd,
  children,
}: {
  title: string;
  onAdd?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="ins-section">
      <h5>
        {title}
        {onAdd && (
          <span className="ins-add-btn" aria-label="추가">
            <i className="fa-solid fa-plus" aria-hidden />
          </span>
        )}
      </h5>
      {children}
    </section>
  );
}

function PropField({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="ins-prop">
      <label>{label}</label>
      <input defaultValue={value} />
      <span className="unit">{unit}</span>
    </div>
  );
}

function ReadOnlyRow({ icon, label, meta }: { icon: string; label: string; meta: string }) {
  return (
    <div className="ins-type-row">
      <i className={`fa-solid ${icon} ins-type-icon`} aria-hidden />
      <span className="ins-type-label">{label}</span>
      {meta && <span className="ins-type-meta">{meta}</span>}
    </div>
  );
}

function SwatchRow({ color, alpha }: { color: string; alpha: string }) {
  return (
    <div className="ins-swatch-row">
      <span className="ins-swatch" style={{ background: color }} />
      <span className="ins-swatch-val">{color}</span>
      <span className="ins-swatch-alpha">{alpha}</span>
      <i className="fa-solid fa-eye ins-swatch-eye" aria-hidden />
    </div>
  );
}

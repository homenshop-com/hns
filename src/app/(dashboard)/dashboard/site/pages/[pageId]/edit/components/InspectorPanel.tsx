/**
 * InspectorPanel — right-side inspector with three tabs (디자인 / 레이어 /
 * 인터랙션), matching the Claude Design "Editor Canvas.html" prototype.
 *
 * - 디자인 tab: live selection header + editable position/size/rotation +
 *   typography/채우기/테두리/이펙트 controls, all wired to the Zustand
 *   scene store (setFrame / setTransform / setStyle). Undo/redo (zundo)
 *   captures every edit for free.
 * - 레이어 tab: wraps the existing LayerPanel component.
 * - 인터랙션 tab: pick a click-time action — link / scrollTo / modal /
 *   toggle — persisted on the layer via setInteraction and emitted as
 *   data-hns-interaction on publish. The published route wires up the
 *   runtime; this panel only mutates the scene.
 */

"use client";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  useEditorStore,
  selectRoot,
} from "../store/editor-store";
import type { Layer, LayerId, LayerInteraction, LayerStyle } from "@/lib/scene";

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
          <InteractionTab layer={layer} />
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

      <TypographySection layer={layer} />

      <FillSection layer={layer} />

      <BorderSection layer={layer} />

      <EffectSection layer={layer} />
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

/* ─── Style-editing sections (Sprint 9k) ──────────────────────────── */

function TypographySection({ layer }: { layer: Layer }) {
  const setStyle = useEditorStore((s) => s.setStyle);
  const s = layer.style ?? {};
  return (
    <Section title="타이포그래피">
      <div className="ins-prop-row">
        <TextField
          label="폰트"
          value={s.fontFamily ?? ""}
          placeholder="Pretendard"
          onCommit={(v) => setStyle(layer.id, { fontFamily: v })}
        />
      </div>
      <div className="ins-prop-row">
        <TextField
          label="크기"
          value={s.fontSize ?? ""}
          placeholder="16px"
          onCommit={(v) => setStyle(layer.id, { fontSize: v })}
        />
        <TextField
          label="굵기"
          value={s.fontWeight != null ? String(s.fontWeight) : ""}
          placeholder="400"
          onCommit={(v) => setStyle(layer.id, { fontWeight: v })}
        />
      </div>
      <div className="ins-prop-row">
        <TextField
          label="행간"
          value={s.lineHeight ?? ""}
          placeholder="1.6"
          onCommit={(v) => setStyle(layer.id, { lineHeight: v })}
        />
        <TextField
          label="자간"
          value={s.letterSpacing ?? ""}
          placeholder="0"
          onCommit={(v) => setStyle(layer.id, { letterSpacing: v })}
        />
      </div>
      <div className="ins-prop-row">
        <AlignToggle
          value={s.textAlign ?? ""}
          onChange={(v) => setStyle(layer.id, { textAlign: v as LayerStyle["textAlign"] })}
        />
      </div>
      <SwatchEditor
        label="글자색"
        value={s.color ?? ""}
        onChange={(v) => setStyle(layer.id, { color: v })}
      />
    </Section>
  );
}

function FillSection({ layer }: { layer: Layer }) {
  const setStyle = useEditorStore((s) => s.setStyle);
  const s = layer.style ?? {};
  return (
    <Section title="채우기">
      <SwatchEditor
        label="배경"
        value={s.background ?? ""}
        onChange={(v) => setStyle(layer.id, { background: v })}
      />
      <div className="ins-prop-row">
        <TextField
          label="투명도"
          value={s.opacity != null ? String(s.opacity) : ""}
          placeholder="1"
          onCommit={(v) => {
            if (v === "") {
              setStyle(layer.id, { opacity: undefined });
              return;
            }
            const n = parseFloat(v);
            if (Number.isFinite(n)) {
              setStyle(layer.id, { opacity: Math.max(0, Math.min(1, n)) });
            }
          }}
        />
      </div>
    </Section>
  );
}

function BorderSection({ layer }: { layer: Layer }) {
  const setStyle = useEditorStore((s) => s.setStyle);
  const s = layer.style ?? {};
  return (
    <Section title="테두리">
      <SwatchEditor
        label="색상"
        value={s.borderColor ?? ""}
        onChange={(v) => setStyle(layer.id, { borderColor: v })}
      />
      <div className="ins-prop-row">
        <TextField
          label="두께"
          value={s.borderWidth ?? ""}
          placeholder="1px"
          onCommit={(v) => setStyle(layer.id, { borderWidth: v })}
        />
        <TextField
          label="라운드"
          value={s.borderRadius ?? ""}
          placeholder="8px"
          onCommit={(v) => setStyle(layer.id, { borderRadius: v })}
        />
      </div>
      <div className="ins-prop-row">
        <SelectField
          label="스타일"
          value={s.borderStyle ?? ""}
          options={[
            ["", "없음"],
            ["solid", "solid"],
            ["dashed", "dashed"],
            ["dotted", "dotted"],
            ["double", "double"],
          ]}
          onChange={(v) =>
            setStyle(layer.id, { borderStyle: (v || undefined) as LayerStyle["borderStyle"] })
          }
        />
      </div>
    </Section>
  );
}

function EffectSection({ layer }: { layer: Layer }) {
  const setStyle = useEditorStore((s) => s.setStyle);
  const s = layer.style ?? {};
  return (
    <Section title="이펙트">
      <div className="ins-prop-row">
        <TextField
          label="box-shadow"
          value={s.boxShadow ?? ""}
          placeholder="0 4px 10px rgba(0,0,0,.25)"
          onCommit={(v) => setStyle(layer.id, { boxShadow: v })}
          wide
        />
      </div>
      <div className="ins-prop-row">
        <TextField
          label="filter"
          value={s.filter ?? ""}
          placeholder="blur(4px)"
          onCommit={(v) => setStyle(layer.id, { filter: v })}
          wide
        />
      </div>
    </Section>
  );
}

/* ─── Interaction tab (Sprint 9k) ─────────────────────────────────── */

function InteractionTab({ layer }: { layer: Layer | null }) {
  const setInteraction = useEditorStore((s) => s.setInteraction);

  if (!layer) {
    return (
      <div className="ins-empty">
        <div className="ins-empty-icon">
          <i className="fa-solid fa-bolt" aria-hidden />
        </div>
        <div className="ins-empty-title">선택된 요소 없음</div>
        <div className="ins-empty-sub">
          인터랙션을 추가하려면
          <br />
          레이어를 먼저 선택하세요
        </div>
      </div>
    );
  }

  const interaction = layer.interaction ?? null;
  const kind = interaction?.kind ?? "";

  const setKind = (k: string) => {
    if (k === "") {
      setInteraction(layer.id, null);
      return;
    }
    if (k === "link") setInteraction(layer.id, { kind: "link", href: "" });
    else if (k === "scrollTo") setInteraction(layer.id, { kind: "scrollTo", targetId: "", smooth: true });
    else if (k === "modal") setInteraction(layer.id, { kind: "modal", targetId: "" });
    else if (k === "toggle") setInteraction(layer.id, { kind: "toggle", targetId: "", className: "active" });
  };

  return (
    <div className="ins-interaction-tab">
      <header className="ins-sel-header">
        <div className="ins-sel-row">
          <div className="ins-sel-icon" style={{ color: "#f4b66a" }}>
            <i className="fa-solid fa-bolt" aria-hidden />
          </div>
          <div className="ins-sel-name-static">{layer.name}</div>
        </div>
      </header>

      <Section title="클릭 시 동작">
        <div className="ins-prop-row">
          <SelectField
            label="액션"
            value={kind}
            options={[
              ["", "없음"],
              ["link", "링크 이동"],
              ["scrollTo", "섹션으로 스크롤"],
              ["modal", "모달 열기"],
              ["toggle", "클래스 토글"],
            ]}
            onChange={setKind}
          />
        </div>

        {interaction?.kind === "link" && (
          <>
            <div className="ins-prop-row">
              <TextField
                label="URL"
                value={interaction.href}
                placeholder="https://..."
                onCommit={(v) =>
                  setInteraction(layer.id, { ...interaction, href: v })
                }
                wide
              />
            </div>
            <div className="ins-prop-row">
              <SelectField
                label="대상"
                value={interaction.target ?? "_self"}
                options={[
                  ["_self", "같은 창"],
                  ["_blank", "새 창"],
                ]}
                onChange={(v) =>
                  setInteraction(layer.id, {
                    ...interaction,
                    target: v === "_blank" ? "_blank" : "_self",
                  })
                }
              />
            </div>
          </>
        )}

        {interaction?.kind === "scrollTo" && (
          <>
            <div className="ins-prop-row">
              <TextField
                label="대상 ID"
                value={interaction.targetId}
                placeholder="obj_sec_xxx"
                onCommit={(v) =>
                  setInteraction(layer.id, { ...interaction, targetId: v })
                }
                wide
              />
            </div>
            <div className="ins-prop-row">
              <SelectField
                label="부드럽게"
                value={interaction.smooth ? "1" : "0"}
                options={[
                  ["1", "예 (smooth)"],
                  ["0", "아니오"],
                ]}
                onChange={(v) =>
                  setInteraction(layer.id, { ...interaction, smooth: v === "1" })
                }
              />
            </div>
          </>
        )}

        {interaction?.kind === "modal" && (
          <div className="ins-prop-row">
            <TextField
              label="모달 ID"
              value={interaction.targetId}
              placeholder="modal-xxx"
              onCommit={(v) =>
                setInteraction(layer.id, { ...interaction, targetId: v })
              }
              wide
            />
          </div>
        )}

        {interaction?.kind === "toggle" && (
          <>
            <div className="ins-prop-row">
              <TextField
                label="대상 ID"
                value={interaction.targetId}
                placeholder="menu-panel"
                onCommit={(v) =>
                  setInteraction(layer.id, { ...interaction, targetId: v })
                }
                wide
              />
            </div>
            <div className="ins-prop-row">
              <TextField
                label="클래스"
                value={interaction.className}
                placeholder="active"
                onCommit={(v) =>
                  setInteraction(layer.id, { ...interaction, className: v })
                }
                wide
              />
            </div>
          </>
        )}

        {kind !== "" && (
          <button
            type="button"
            className="ins-empty-btn"
            onClick={() => setInteraction(layer.id, null)}
          >
            <i className="fa-solid fa-xmark" aria-hidden /> 인터랙션 제거
          </button>
        )}
      </Section>

      <div className="ins-empty-sub" style={{ padding: "0 16px", marginTop: 8 }}>
        인터랙션은 저장 후 실제 사이트에서 동작합니다.
      </div>
    </div>
  );
}

/* ─── Small reusable editors ──────────────────────────────────────── */

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

function TextField({
  label,
  value,
  placeholder,
  onCommit,
  wide,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit(value: string): void;
  wide?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className={`ins-prop${wide ? " wide" : ""}`}>
      <label>{label}</label>
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<readonly [string, string]>;
  onChange(value: string): void;
}) {
  return (
    <div className="ins-prop">
      <label>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ins-select"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function AlignToggle({
  value,
  onChange,
}: {
  value: string;
  onChange(value: string): void;
}) {
  const opts: Array<[string, string, string]> = [
    ["left",    "fa-align-left",    "왼쪽"],
    ["center",  "fa-align-center",  "가운데"],
    ["right",   "fa-align-right",   "오른쪽"],
    ["justify", "fa-align-justify", "양쪽"],
  ];
  return (
    <div className="ins-align-toggle" role="radiogroup" aria-label="정렬">
      {opts.map(([v, icon, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          title={label}
          className={`ins-align-btn${value === v ? " active" : ""}`}
          onClick={() => onChange(value === v ? "" : v)}
        >
          <i className={`fa-solid ${icon}`} aria-hidden />
        </button>
      ))}
    </div>
  );
}

function SwatchEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const colorProbe = /^#[0-9a-f]{3,8}$/i.test(value) ? value : "#000000";
  return (
    <div className="ins-swatch-editor">
      <label>{label}</label>
      <input
        type="color"
        className="ins-swatch-color"
        value={colorProbe}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
      />
      <input
        className="ins-swatch-input"
        value={draft}
        placeholder="#000000"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onChange(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ins-section">
      <h5>{title}</h5>
      {children}
    </section>
  );
}

// Silence unused-var warning for LayerInteraction used only as a type.
export type __InspectorInteractionRef = LayerInteraction;

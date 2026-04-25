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

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  useEditorStore,
  selectRoot,
  readImgFromInnerHtml,
} from "../store/editor-store";
import type { BoxLayer, ImageLayer, Layer, LayerId, LayerInteraction, LayerStyle } from "@/lib/scene";

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
  /** Owner site id — passed to /api/upload so files land in the
   *  per-site folder and show up in the 에셋 tab. */
  siteId?: string;
}

export default function InspectorPanel({ enabled, siteId }: Props) {
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
          <DesignTab layer={layer} path={path} siteId={siteId} />
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
  siteId?: string;
}

function DesignTab({ layer, path, siteId }: DesignTabProps) {
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

      {/* Image-edit section: appears for image layers (typed src/alt) AND
          for box layers whose innerHtml contains an <img> (e.g., the
          Company Preview .frame wrapping img + decorative overlays). */}
      {(() => {
        if (layer.type === "image") {
          return <ImageSection layer={layer as ImageLayer} siteId={siteId} />;
        }
        if (layer.type === "box") {
          const box = layer as BoxLayer;
          const imgAttrs = readImgFromInnerHtml(box.innerHtml ?? "");
          if (imgAttrs) {
            return <ImageSection layer={layer} initialAttrs={imgAttrs} siteId={siteId} />;
          }
        }
        return null;
      })()}

      <TypographySection layer={layer} />

      <FillSection layer={layer} />

      {/* Background image editor — for box layers without an inner <img>,
          let the user set CSS `background-image: url(...)`. Boxes that
          DO have an inner <img> get the ImageSection above instead. */}
      {layer.type === "box" && !readImgFromInnerHtml((layer as BoxLayer).innerHtml ?? "") && (
        <BackgroundImageSection layer={layer} siteId={siteId} />
      )}

      <BorderSection layer={layer} />

      <EffectSection layer={layer} />
    </>
  );
}

/* ─── Image-specific section (2026-04-25) ────────────────────────── */

/**
 * ImageSection — appears in the design tab when the selected layer is an
 * image (typed) OR a box whose innerHtml contains an <img>. Lets the
 * user replace the source (URL paste or file upload), edit alt text,
 * switch object-fit, and set an optional click-through link. Commits
 * flow through `setImage` which mutates the typed fields AND rewrites
 * `innerHtml` in parallel for image layers; for box layers, only
 * innerHtml is rewritten.
 *
 * `initialAttrs` is supplied for box layers (read out of innerHtml at
 * render time). Image layers ignore it and read from typed fields.
 */
function ImageSection({
  layer,
  initialAttrs,
  siteId,
}: {
  layer: Layer;
  initialAttrs?: { src: string; alt?: string; href?: string; hrefTarget?: string; objectFit?: ImageLayer["objectFit"] };
  siteId?: string;
}) {
  const setImage = useEditorStore((s) => s.setImage);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const isImage = layer.type === "image";
  const img = isImage ? (layer as ImageLayer) : null;
  const src = isImage ? img!.src ?? "" : initialAttrs?.src ?? "";
  const alt = isImage ? img!.alt ?? "" : initialAttrs?.alt ?? "";
  const href = isImage ? img!.href ?? "" : initialAttrs?.href ?? "";
  const objectFit: string = isImage
    ? (img!.objectFit ?? "")
    : (initialAttrs?.objectFit ?? "");

  const handleFile = async (file: File) => {
    setUploading(true);
    setUploadErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "site-uploads");
      fd.append("compress", "true");
      if (siteId) fd.append("siteId", siteId);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `업로드 실패 (${res.status})`);
      }
      const { url } = await res.json();
      if (typeof url === "string") setImage(layer.id, { src: url });
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Section title="이미지">
      <div className="ins-prop-row">
        <TextField
          label="소스"
          value={src}
          placeholder="https://… 또는 /uploaded/…"
          onCommit={(v) => setImage(layer.id, { src: v })}
          wide
        />
      </div>
      <div className="ins-prop-row">
        <button
          type="button"
          className="ins-btn"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          style={{
            flex: 1,
            padding: "8px 10px",
            background: "#2a79ff",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: uploading ? "wait" : "pointer",
            fontSize: 12,
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <i className="fa-solid fa-upload" style={{ marginRight: 6 }} />
          {uploading ? "업로드 중…" : "파일 업로드"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
      {uploadErr && (
        <div
          className="ins-prop-row"
          style={{ color: "#ff6b6b", fontSize: 11, padding: "0 4px" }}
        >
          {uploadErr}
        </div>
      )}
      <div className="ins-prop-row">
        <TextField
          label="대체 텍스트"
          value={alt}
          placeholder="이미지 설명 (SEO·접근성)"
          onCommit={(v) => setImage(layer.id, { alt: v })}
          wide
        />
      </div>
      <div className="ins-prop-row">
        <FitToggle
          value={objectFit}
          onChange={(v) =>
            setImage(layer.id, {
              objectFit: (v || undefined) as ImageLayer["objectFit"],
            })
          }
        />
      </div>
      <div className="ins-prop-row">
        <TextField
          label="링크"
          value={href}
          placeholder="클릭 시 이동할 URL (선택)"
          onCommit={(v) => setImage(layer.id, { href: v })}
          wide
        />
      </div>
    </Section>
  );
}

/**
 * BackgroundImageSection — for box layers WITHOUT an inner `<img>`. Sets
 * CSS `background-image: url(...)` via setStyle's `background` field
 * (CSS shorthand handles both color and image). On the first edit, we
 * preserve any existing color/gradient by stripping just the url(...)
 * token and re-emitting `url(<new>) <existing-rest>`.
 */
function BackgroundImageSection({ layer, siteId }: { layer: Layer; siteId?: string }) {
  const setStyle = useEditorStore((s) => s.setStyle);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const bg = layer.style?.background ?? "";
  const urlMatch = bg.match(/url\(["']?([^"')]+)["']?\)/);
  const currentUrl = urlMatch?.[1] ?? "";

  const setBgUrl = (url: string) => {
    if (!url) {
      // Clear: strip the url() token, keep the rest. If nothing else
      // remains, drop background entirely.
      const stripped = bg.replace(/url\(["']?[^"')]+["']?\)\s*/g, "").trim();
      setStyle(layer.id, { background: stripped || undefined });
      return;
    }
    if (urlMatch) {
      const next = bg.replace(/url\(["']?[^"')]+["']?\)/, `url("${url}")`);
      setStyle(layer.id, { background: next });
    } else {
      // No prior url — append. Center / cover / no-repeat is the most
      // common useful default for background imagery.
      const prefix = bg ? `${bg} ` : "";
      setStyle(layer.id, {
        background: `${prefix}url("${url}") center/cover no-repeat`,
      });
    }
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    setUploadErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "site-uploads");
      fd.append("compress", "true");
      if (siteId) fd.append("siteId", siteId);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `업로드 실패 (${res.status})`);
      }
      const { url } = await res.json();
      if (typeof url === "string") setBgUrl(url);
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Section title="배경 이미지">
      <div className="ins-prop-row">
        <TextField
          label="URL"
          value={currentUrl}
          placeholder="https://… 또는 /uploaded/…"
          onCommit={setBgUrl}
          wide
        />
      </div>
      <div className="ins-prop-row">
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          style={{
            flex: 1,
            padding: "8px 10px",
            background: "#2a79ff",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: uploading ? "wait" : "pointer",
            fontSize: 12,
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <i className="fa-solid fa-upload" style={{ marginRight: 6 }} />
          {uploading ? "업로드 중…" : "배경 이미지 업로드"}
        </button>
        {currentUrl && (
          <button
            type="button"
            onClick={() => setBgUrl("")}
            title="배경 이미지 제거"
            style={{
              padding: "8px 10px",
              background: "#3a3d4a",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            <i className="fa-solid fa-trash" />
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
      {uploadErr && (
        <div
          className="ins-prop-row"
          style={{ color: "#ff6b6b", fontSize: 11, padding: "0 4px" }}
        >
          {uploadErr}
        </div>
      )}
    </Section>
  );
}

function FitToggle({
  value,
  onChange,
}: {
  value: string;
  onChange(v: string): void;
}) {
  const opts: Array<[string, string]> = [
    ["", "자동"],
    ["cover", "cover"],
    ["contain", "contain"],
    ["fill", "fill"],
    ["none", "none"],
  ];
  return (
    <div className="ins-prop wide">
      <label>맞춤</label>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {opts.map(([v, label]) => (
          <button
            key={v || "auto"}
            type="button"
            onClick={() => onChange(v)}
            style={{
              flex: "1 1 auto",
              padding: "5px 8px",
              fontSize: 11,
              border: "1px solid #2a2d3a",
              background: value === v ? "#2a79ff" : "#1a1c24",
              color: value === v ? "#fff" : "#c6c9d6",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
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
        <DimensionField
          label="크기"
          value={s.fontSize ?? ""}
          placeholder="16"
          defaultUnit="px"
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
        <DimensionField
          label="자간"
          value={s.letterSpacing ?? ""}
          placeholder="0"
          defaultUnit="em"
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
        <DimensionField
          label="두께"
          value={s.borderWidth ?? ""}
          placeholder="1"
          defaultUnit="px"
          onCommit={(v) => setStyle(layer.id, { borderWidth: v })}
        />
        <DimensionField
          label="라운드"
          value={s.borderRadius ?? ""}
          placeholder="8"
          defaultUnit="px"
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

/**
 * DimensionField — a TextField variant for CSS length values that splits
 * the numeric part from the unit. The input only shows the number; the
 * unit (px/em/rem/%) sits outside as a read-only suffix, matching the
 * 위치·크기 row so users don't have to type "px" themselves.
 *
 * On commit:
 *   - Bare number (e.g. "8")          → append `${defaultUnit}` (e.g. "8px")
 *   - Number + unit (e.g. "1.5rem")   → use verbatim
 *   - Empty / invalid                 → emit as-is (lets user clear the token)
 *
 * On display: parses `value` into { num, unit }; the typed unit is
 * preserved so re-edit doesn't clobber em/rem/%. Falls back to
 * `defaultUnit` when `value` has no explicit unit.
 */
function DimensionField({
  label,
  value,
  placeholder,
  defaultUnit = "px",
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  defaultUnit?: string;
  onCommit(value: string): void;
}) {
  const parse = (v: string): { num: string; unit: string } => {
    const s = (v ?? "").trim();
    if (!s) return { num: "", unit: defaultUnit };
    const m = s.match(/^(-?\d+(?:\.\d+)?)\s*([a-z%]*)$/i);
    if (m) return { num: m[1]!, unit: m[2] || defaultUnit };
    // Unparseable (e.g. calc(), var()) — show raw, no unit suffix.
    return { num: s, unit: "" };
  };
  const initial = parse(value);
  const [draft, setDraft] = useState(initial.num);
  const [unitDraft, setUnitDraft] = useState(initial.unit);
  useEffect(() => {
    const p = parse(value);
    setDraft(p.num);
    setUnitDraft(p.unit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = () => {
    const typed = draft.trim();
    if (!typed) {
      if (value !== "") onCommit("");
      return;
    }
    // Bare number → append the current unit (or defaultUnit if none).
    if (/^-?\d+(?:\.\d+)?$/.test(typed)) {
      const next = `${typed}${unitDraft || defaultUnit}`;
      if (next !== value) onCommit(next);
      return;
    }
    // Number + unit (e.g. 1.5rem) — use the whole thing, re-parse on next tick.
    if (/^-?\d+(?:\.\d+)?\s*[a-z%]+$/i.test(typed)) {
      if (typed !== value) onCommit(typed);
      return;
    }
    // Unparseable — trust user input.
    if (typed !== value) onCommit(typed);
  };
  return (
    <div className="ins-prop">
      <label>{label}</label>
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(parse(value).num);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {unitDraft && <span className="unit">{unitDraft}</span>}
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

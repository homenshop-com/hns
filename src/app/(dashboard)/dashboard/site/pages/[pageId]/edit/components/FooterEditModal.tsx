/**
 * FooterEditModal — one-stop footer editor.
 *
 * Mirrors HeaderEditModal's pattern but trimmed for the footer's
 * typical content: company info / copyright / sitemap links / social
 * icons. No menu manager or language switcher (rarely in footers).
 *
 * Sections:
 *   1. 이미지 — replace any <img> in footer (logo, social icons, …)
 *   2. 푸터 텍스트 — every visible text node, live-bound to inputs
 *   3. 링크 — every <a> in the footer with editable label + href
 *   4. 푸터 스타일 — 높이 / 배경
 *   5. 고급 — 푸터 초기화 (revert to template default)
 *
 * Same direct-DOM strategy as HeaderEditModal: every change patches the
 * live `footerRef.current` so the user sees results instantly. The main
 * editor's Save button picks up `footerRef.current.innerHTML` and
 * persists it to Site.footerHtml.
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

interface Props {
  siteId: string;
  /** Live footer DOM element. All edits patch this directly. */
  footerRef: React.RefObject<HTMLElement | null>;
  /** Initial footerHtml — used by "푸터 초기화". */
  initialFooterHtml: string;
  onClose: () => void;
}

interface TextNodeEdit {
  key: string;
  text: string;
  node: Text;
}

interface ImageEdit {
  key: string;
  el: HTMLImageElement;
  src: string;
  alt: string;
}

interface LinkEdit {
  key: string;
  el: HTMLAnchorElement;
  label: string;
  href: string;
  target: string;
}

export default function FooterEditModal({
  siteId,
  footerRef,
  initialFooterHtml,
  onClose,
}: Props) {
  const t = useTranslations("editor");

  /* ── 1. Images ── */
  const [images, setImages] = useState<ImageEdit[]>([]);
  const [imgUploadBusy, setImgUploadBusy] = useState<string | null>(null);

  useEffect(() => {
    const fEl = footerRef.current;
    if (!fEl) return;
    const out: ImageEdit[] = [];
    Array.from(fEl.querySelectorAll<HTMLImageElement>("img")).forEach((el, i) => {
      out.push({
        key: `img${i}`,
        el,
        src: el.getAttribute("src") ?? "",
        alt: el.getAttribute("alt") ?? "",
      });
    });
    setImages(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replaceImage = async (img: ImageEdit, file: File) => {
    setImgUploadBusy(img.key);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "site-uploads");
      fd.append("compress", "true");
      if (siteId) fd.append("siteId", siteId);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `${t("footerModal.uploadFailed")} (${res.status})`);
      }
      const { url } = (await res.json()) as { url?: string };
      if (typeof url !== "string") return;
      img.el.setAttribute("src", url);
      setImages((prev) =>
        prev.map((p) => (p.key === img.key ? { ...p, src: url } : p)),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : t("footerModal.uploadFailed"));
    } finally {
      setImgUploadBusy(null);
    }
  };

  const updateAlt = (key: string, alt: string) => {
    setImages((prev) =>
      prev.map((p) => {
        if (p.key !== key) return p;
        if (alt) p.el.setAttribute("alt", alt);
        else p.el.removeAttribute("alt");
        return { ...p, alt };
      }),
    );
  };

  /* ── 2. Text nodes ── */
  const [textEdits, setTextEdits] = useState<TextNodeEdit[]>([]);

  useEffect(() => {
    const fEl = footerRef.current;
    if (!fEl) return;
    const out: TextNodeEdit[] = [];
    const walker = document.createTreeWalker(fEl, NodeFilter.SHOW_TEXT, {
      acceptNode(n: Node) {
        const t = n.textContent?.trim() ?? "";
        if (t.length < 2) return NodeFilter.FILTER_REJECT;
        const p = (n.parentElement?.tagName ?? "").toUpperCase();
        if (p === "SCRIPT" || p === "STYLE") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n: Node | null;
    let i = 0;
    while ((n = walker.nextNode())) {
      out.push({
        key: `t${i++}`,
        text: (n.textContent ?? "").replace(/\s+/g, " ").trim(),
        node: n as Text,
      });
    }
    setTextEdits(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateTextNode = (key: string, value: string) => {
    setTextEdits((prev) =>
      prev.map((t) => {
        if (t.key !== key) return t;
        if (t.node && t.node.parentNode) t.node.textContent = value;
        return { ...t, text: value };
      }),
    );
  };

  /* ── 3. Links — every <a> ── */
  const [links, setLinks] = useState<LinkEdit[]>([]);

  useEffect(() => {
    const fEl = footerRef.current;
    if (!fEl) return;
    const out: LinkEdit[] = [];
    Array.from(fEl.querySelectorAll<HTMLAnchorElement>("a")).forEach((el, i) => {
      // Use innerText (visible text) as the label — strips inline icons.
      out.push({
        key: `a${i}`,
        el,
        label: el.innerText.trim(),
        href: el.getAttribute("href") ?? "",
        target: el.getAttribute("target") ?? "",
      });
    });
    setLinks(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateLinkLabel = (key: string, label: string) => {
    setLinks((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        // Replace the FIRST significant text node inside the anchor —
        // preserves any leading/trailing icons.
        const walk = document.createTreeWalker(l.el, NodeFilter.SHOW_TEXT);
        let n: Node | null;
        while ((n = walk.nextNode())) {
          if (n.textContent && n.textContent.trim().length > 0) {
            n.textContent = label;
            return { ...l, label };
          }
        }
        // No existing text node — append a new one.
        l.el.appendChild(document.createTextNode(label));
        return { ...l, label };
      }),
    );
  };

  const updateLinkHref = (key: string, href: string) => {
    setLinks((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        if (href) l.el.setAttribute("href", href);
        else l.el.removeAttribute("href");
        return { ...l, href };
      }),
    );
  };

  const toggleLinkBlank = (key: string) => {
    setLinks((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = l.target === "_blank" ? "" : "_blank";
        if (next) l.el.setAttribute("target", next);
        else l.el.removeAttribute("target");
        return { ...l, target: next };
      }),
    );
  };

  /* ── 4. Footer style — height / background, persist via inline style.
   *      Footer rarely needs sticky/managed CSS block, so we keep this
   *      simple: edit footer's own inline style. The save flow captures
   *      the wrapping element's outerHTML, so inline style persists.
   */
  const [height, setHeight] = useState<string>(() => footerRef.current?.style.minHeight ?? "");
  const [bg, setBg] = useState<string>(() => footerRef.current?.style.background ?? "");

  const applyHeight = (v: string) => {
    setHeight(v);
    const fEl = footerRef.current;
    if (!fEl) return;
    if (v && v !== "auto") fEl.style.minHeight = v;
    else fEl.style.removeProperty("min-height");
  };
  const applyBg = (v: string) => {
    setBg(v);
    const fEl = footerRef.current;
    if (!fEl) return;
    if (v && v !== "transparent") fEl.style.background = v;
    else fEl.style.removeProperty("background");
  };

  /* ── 5. Reset ── */
  const resetFooter = () => {
    if (!confirm(t("footerModal.confirmReset"))) return;
    const fEl = footerRef.current;
    if (!fEl) return;
    fEl.innerHTML = initialFooterHtml;
    onClose();
  };

  const linkCount = useMemo(() => links.length, [links]);
  const imgCount = useMemo(() => images.length, [images]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 11000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(640px, 92vw)",
          maxHeight: "85vh",
          background: "#1a1c24",
          color: "#e8eaf2",
          borderRadius: 10,
          border: "1px solid #2a2d3a",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Title bar */}
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid #2a2d3a",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{t("footerModal.title")}</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
              {t("footerModal.sub")}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#888",
              fontSize: 18,
              cursor: "pointer",
              padding: 4,
            }}
            aria-label={t("footerModal.close")}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {/* 1. Images */}
          <Section title={t("footerModal.imagesSection", { count: imgCount })}>
            {images.length === 0 && (
              <div style={{ color: "#666", fontSize: 12 }}>
                {t("footerModal.noImages")}
              </div>
            )}
            {images.map((img) => (
              <ImageRow
                key={img.key}
                img={img}
                busy={imgUploadBusy === img.key}
                onPick={(f) => replaceImage(img, f)}
                onAltChange={(v) => updateAlt(img.key, v)}
              />
            ))}
          </Section>

          {/* 2. Texts */}
          <Section
            title={t("footerModal.footerText", { count: textEdits.length })}
            sub={t("footerModal.footerTextSub")}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                maxHeight: 220,
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {textEdits.length === 0 && (
                <div style={{ color: "#666", fontSize: 12 }}>
                  {t("footerModal.noEditableText")}
                </div>
              )}
              {textEdits.map((t) => (
                <input
                  key={t.key}
                  value={t.text}
                  onChange={(e) => updateTextNode(t.key, e.target.value)}
                  style={textInput}
                />
              ))}
            </div>
          </Section>

          {/* 3. Links */}
          <Section title={t("footerModal.linksSection", { count: linkCount })} sub={t("footerModal.linksSub")}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                maxHeight: 220,
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {links.length === 0 && (
                <div style={{ color: "#666", fontSize: 12 }}>
                  {t("footerModal.noLinks")}
                </div>
              )}
              {links.map((l) => (
                <div
                  key={l.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 28px",
                    gap: 4,
                    alignItems: "center",
                  }}
                >
                  <input
                    value={l.label}
                    placeholder={t("footerModal.labelPlaceholder")}
                    onChange={(e) => updateLinkLabel(l.key, e.target.value)}
                    style={textInput}
                  />
                  <input
                    value={l.href}
                    placeholder={t("footerModal.urlPlaceholder")}
                    onChange={(e) => updateLinkHref(l.key, e.target.value)}
                    style={textInput}
                  />
                  <button
                    type="button"
                    onClick={() => toggleLinkBlank(l.key)}
                    title={l.target === "_blank" ? t("footerModal.newWindowOn") : t("footerModal.sameWindow")}
                    style={{
                      width: 28,
                      height: 28,
                      padding: 0,
                      background: "transparent",
                      color: l.target === "_blank" ? "#3ccf97" : "#666",
                      border: "1px solid #2a2d3a",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                  >
                    <i className="fa-solid fa-up-right-from-square" />
                  </button>
                </div>
              ))}
            </div>
          </Section>

          {/* 4. Style */}
          <Section title={t("footerModal.footerStyle")}>
            <div style={{ display: "flex", gap: 10 }}>
              <label style={miniLabel}>
                {t("footerModal.heightLabel")}
                <input
                  type="text"
                  value={height}
                  onChange={(e) => applyHeight(e.target.value)}
                  placeholder="auto / 320px"
                  style={miniInput}
                />
              </label>
              <label style={miniLabel}>
                {t("footerModal.bgLabel")}
                <input
                  type="text"
                  value={bg}
                  onChange={(e) => applyBg(e.target.value)}
                  placeholder="transparent / #111"
                  style={miniInput}
                />
              </label>
            </div>
          </Section>

          {/* 5. Reset */}
          <Section title={t("footerModal.advanced")}>
            <button type="button" onClick={resetFooter} style={dangerBtn}>
              <i className="fa-solid fa-rotate-left" style={{ marginRight: 6 }} />
              {t("footerModal.resetFooter")}
            </button>
          </Section>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid #2a2d3a",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ flex: 1, fontSize: 11, color: "#666" }}>
            {t("footerModal.saveTip")}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px",
              background: "#2a79ff",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {t("footerModal.doneClose")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Image row ─── */

function ImageRow({
  img,
  busy,
  onPick,
  onAltChange,
}: {
  img: ImageEdit;
  busy: boolean;
  onPick: (f: File) => void;
  onAltChange: (v: string) => void;
}) {
  const t = useTranslations("editor");
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
      <img
        src={img.src}
        alt={img.alt}
        style={{
          width: 48,
          height: 48,
          objectFit: "contain",
          borderRadius: 4,
          background: "#0f1117",
          border: "1px solid #2a2d3a",
        }}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          style={{
            padding: "5px 10px",
            background: "#2a79ff",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: busy ? "wait" : "pointer",
            fontSize: 11,
            opacity: busy ? 0.6 : 1,
            alignSelf: "flex-start",
          }}
        >
          <i className="fa-solid fa-upload" style={{ marginRight: 5 }} />
          {busy ? t("footerModal.uploading") : t("footerModal.replaceImage")}
        </button>
        <input
          value={img.alt}
          placeholder={t("footerModal.altPlaceholder")}
          onChange={(e) => onAltChange(e.target.value)}
          style={{ ...textInput, fontSize: 11 }}
        />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* ─── Helpers ─── */

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 600,
          color: "#aaa",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {title}
      </h4>
      {sub && (
        <div style={{ fontSize: 10, color: "#666", marginTop: 2, marginBottom: 8 }}>
          {sub}
        </div>
      )}
      {!sub && <div style={{ height: 8 }} />}
      {children}
    </div>
  );
}

const textInput: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  background: "#0f1117",
  color: "#e8eaf2",
  border: "1px solid #2a2d3a",
  borderRadius: 4,
  fontSize: 12,
  fontFamily: "inherit",
};

const miniLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: "#aaa",
};

const miniInput: React.CSSProperties = {
  width: 120,
  padding: "5px 8px",
  background: "#0f1117",
  color: "#e8eaf2",
  border: "1px solid #2a2d3a",
  borderRadius: 4,
  fontSize: 11,
};

const dangerBtn: React.CSSProperties = {
  padding: "8px 14px",
  background: "transparent",
  color: "#ff8b8b",
  border: "1px solid #ff8b8b",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 500,
};

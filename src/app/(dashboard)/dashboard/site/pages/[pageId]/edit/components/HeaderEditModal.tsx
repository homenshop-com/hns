/**
 * HeaderEditModal — one-stop header editor.
 *
 * Modern templates (HomeBuilder/Plus Academy/Agency) bake their nav
 * into headerHtml as `<nav>` rather than the legacy `#hns_menu` slot;
 * canvas click handlers are gated to `body` so the user can't reach
 * header content from the canvas. This modal sidesteps that entirely
 * by exposing every editable header surface in one place:
 *
 *   1. 로고 — replace image (file upload) or set text logo
 *   2. 헤더 텍스트 — every visible text node in the header becomes a
 *      live-bound input (phone numbers, EST. 1992, "DISPATCH" labels, …)
 *   3. 메뉴 — open MenuManagerModal (Pages-level edits)
 *   4. 헤더 스타일 — sticky / 높이 / 배경
 *   5. 언어 — toggle which langs render the language switcher
 *   6. 고급 — 헤더 초기화 (revert to template default)
 *
 * Direct-DOM mutation strategy: every change patches the live
 * `headerRef.current` so the user sees results instantly. The main
 * editor's Save button picks up `headerRef.current.innerHTML` and
 * persists it to Site.headerHtml. No double-save, no shadow state.
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  siteId: string;
  currentLang: string;
  siteLanguages: string[];
  defaultLanguage: string;
  /** Live header DOM element. All edits patch this directly. */
  headerRef: React.RefObject<HTMLElement | null>;
  /** Initial headerHtml — used by "헤더 초기화". */
  initialHeaderHtml: string;
  /** Current header layout tokens (sticky / height / background). */
  headerLayout: { sticky: boolean; height: string; background: string };
  /** Apply layout tokens — writes pageCss managed block + live styles. */
  onApplyLayout: (next: { sticky: boolean; height: string; background: string }) => void;
  /** Open the menu manager modal (separate component). */
  onOpenMenuManager: () => void;
  onClose: () => void;
}

interface TextNodeEdit {
  /** Stable key — composed of CSS path so we can re-locate the node
   *  if the DOM was repainted between modal opens. */
  key: string;
  text: string;
  // The node reference for direct mutation.
  node: Text;
}

const VALID_LANGS = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh-cn", label: "简体中文" },
  { code: "zh-tw", label: "繁體中文" },
  { code: "es", label: "Español" },
];

export default function HeaderEditModal({
  siteId,
  currentLang,
  siteLanguages,
  defaultLanguage,
  headerRef,
  initialHeaderHtml,
  headerLayout,
  onApplyLayout,
  onOpenMenuManager,
  onClose,
}: Props) {
  /* ── 1. Logo ── */
  const [logoSrc, setLogoSrc] = useState<string>(() => {
    const hEl = headerRef.current;
    if (!hEl) return "";
    const img = hEl.querySelector(
      "#hns_h_logo img, .logo img, [id*=logo] img, header img, a img",
    ) as HTMLImageElement | null;
    return img?.getAttribute("src") ?? "";
  });
  const [logoText, setLogoText] = useState<string>(() => {
    const hEl = headerRef.current;
    if (!hEl) return "";
    // First heading-ish OR the brand word inside header. We look for a
    // non-nav text leaf with significant content.
    const candidates = hEl.querySelectorAll("h1, h2, .brand, .logo, [id*=logo]");
    for (const c of Array.from(candidates)) {
      const t = (c as HTMLElement).innerText?.trim();
      if (t && t.length > 1 && t.length < 40) return t;
    }
    return "";
  });
  const [logoBusy, setLogoBusy] = useState(false);
  const logoFileRef = useRef<HTMLInputElement | null>(null);

  const handleLogoUpload = async (file: File) => {
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "site-uploads");
      fd.append("compress", "true");
      if (siteId) fd.append("siteId", siteId);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `업로드 실패 (${res.status})`);
      }
      const { url } = (await res.json()) as { url?: string };
      if (typeof url !== "string") return;
      // Patch the live header DOM. Match the same selectors as detection.
      const hEl = headerRef.current;
      if (hEl) {
        const img = hEl.querySelector(
          "#hns_h_logo img, .logo img, [id*=logo] img, header img, a img",
        ) as HTMLImageElement | null;
        if (img) img.setAttribute("src", url);
      }
      setLogoSrc(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setLogoBusy(false);
    }
  };

  const handleLogoTextChange = (next: string) => {
    setLogoText(next);
    const hEl = headerRef.current;
    if (!hEl) return;
    const candidates = hEl.querySelectorAll("h1, h2, .brand, .logo, [id*=logo]");
    for (const c of Array.from(candidates)) {
      const t = (c as HTMLElement).innerText?.trim();
      if (t && t.length > 1 && t.length < 40) {
        // Replace the first significant text node inside.
        const walk = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
        let n: Node | null;
        while ((n = walk.nextNode())) {
          if (n.textContent && n.textContent.trim().length > 0) {
            n.textContent = next;
            return;
          }
        }
        return;
      }
    }
  };

  /* ── 2. Header text nodes — every meaningful text gets an input ── */
  const [textEdits, setTextEdits] = useState<TextNodeEdit[]>([]);

  useEffect(() => {
    const hEl = headerRef.current;
    if (!hEl) return;
    const out: TextNodeEdit[] = [];
    const walker = document.createTreeWalker(hEl, NodeFilter.SHOW_TEXT, {
      acceptNode(n: Node) {
        const t = n.textContent?.trim() ?? "";
        // Skip empty / whitespace-only / single-char punctuation.
        if (t.length < 2) return NodeFilter.FILTER_REJECT;
        // Skip text inside <script> / <style>.
        const p = (n.parentElement?.tagName ?? "").toUpperCase();
        if (p === "SCRIPT" || p === "STYLE") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n: Node | null;
    let i = 0;
    while ((n = walker.nextNode())) {
      const text = n.textContent ?? "";
      out.push({
        key: `t${i++}`,
        text: text.replace(/\s+/g, " ").trim(),
        node: n as Text,
      });
    }
    setTextEdits(out);
    // We deliberately re-run only when the modal opens — not on every
    // keystroke — because the DOM mutation we do below would otherwise
    // trigger an infinite loop of re-extraction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateTextNode = (key: string, value: string) => {
    setTextEdits((prev) =>
      prev.map((t) => {
        if (t.key !== key) return t;
        // Patch the live text node — it remains in the DOM, so the
        // canvas updates instantly.
        if (t.node && t.node.parentNode) {
          t.node.textContent = value;
        }
        return { ...t, text: value };
      }),
    );
  };

  /* ── 3. Languages ── */
  const [langs, setLangs] = useState<string[]>(siteLanguages);
  const [defaultLang, setDefaultLang] = useState<string>(defaultLanguage);
  const [langSaving, setLangSaving] = useState(false);
  const [langMsg, setLangMsg] = useState<string | null>(null);

  const saveLanguages = async () => {
    if (langs.length === 0) {
      setLangMsg("최소 1개 언어를 선택하세요.");
      return;
    }
    const finalDefault = langs.includes(defaultLang) ? defaultLang : langs[0]!;
    setLangSaving(true);
    setLangMsg(null);
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languages: langs, defaultLanguage: finalDefault }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `저장 실패 (${res.status})`);
      }
      setLangMsg("저장됨. 새로고침 후 반영됩니다.");
    } catch (e) {
      setLangMsg(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setLangSaving(false);
    }
  };

  /* ── 4. Reset header ── */
  const resetHeader = () => {
    if (!confirm("헤더를 템플릿 초기 상태로 되돌리시겠습니까?\n(현재 편집 내용 손실)")) return;
    const hEl = headerRef.current;
    if (!hEl) return;
    hEl.innerHTML = initialHeaderHtml;
    onClose();
  };

  /* ── Counts for display ── */
  const navLinkCount = useMemo(() => {
    const hEl = headerRef.current;
    if (!hEl) return 0;
    return hEl.querySelectorAll("nav a").length;
  }, []);

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
            <div style={{ fontSize: 15, fontWeight: 600 }}>헤더 편집</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
              로고·텍스트·메뉴·언어·스타일 — 모든 페이지의 헤더에 적용됩니다.
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
            aria-label="닫기"
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
          {/* 1. Logo */}
          <Section title="로고">
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt="logo"
                  style={{
                    width: 48,
                    height: 48,
                    objectFit: "contain",
                    borderRadius: 4,
                    background: "#0f1117",
                    border: "1px solid #2a2d3a",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 4,
                    background: "#0f1117",
                    border: "1px solid #2a2d3a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    color: "#666",
                  }}
                >
                  <i className="fa-solid fa-image" />
                </div>
              )}
              <button
                type="button"
                onClick={() => logoFileRef.current?.click()}
                disabled={logoBusy}
                style={primaryBtn(logoBusy)}
              >
                <i className="fa-solid fa-upload" style={{ marginRight: 6 }} />
                {logoBusy ? "업로드 중…" : "로고 이미지 교체"}
              </button>
              <input
                ref={logoFileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleLogoUpload(f);
                  e.target.value = "";
                }}
              />
            </div>
            {logoText && (
              <div style={{ marginTop: 10 }}>
                <Label>로고 텍스트 (텍스트형 로고일 때)</Label>
                <input
                  value={logoText}
                  onChange={(e) => handleLogoTextChange(e.target.value)}
                  style={textInput}
                />
              </div>
            )}
          </Section>

          {/* 2. Header texts */}
          <Section
            title={`헤더 텍스트 (${textEdits.length})`}
            sub="각 줄을 수정하면 캔버스에 즉시 반영됩니다."
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
                  편집 가능한 텍스트가 없습니다.
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

          {/* 3. Menu */}
          <Section title="메뉴" sub={`현재 헤더 nav 링크: ${navLinkCount}개`}>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenMenuManager();
              }}
              style={primaryBtn(false)}
            >
              <i className="fa-solid fa-list-ul" style={{ marginRight: 6 }} />
              메뉴 관리 열기
            </button>
            <div style={{ marginTop: 6, fontSize: 11, color: "#888" }}>
              순서·표시·이름·외부링크를 일괄 편집합니다. 저장하면 헤더 nav
              가 자동으로 갱신됩니다.
            </div>
          </Section>

          {/* 4. Layout */}
          <Section title="헤더 스타일">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "#e8eaf2",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={headerLayout.sticky}
                onChange={(e) =>
                  onApplyLayout({ ...headerLayout, sticky: e.target.checked })
                }
              />
              스크롤 시 상단 고정 (sticky)
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <label style={miniLabel}>
                높이
                <input
                  type="text"
                  value={headerLayout.height}
                  onChange={(e) =>
                    onApplyLayout({ ...headerLayout, height: e.target.value })
                  }
                  placeholder="auto / 64px"
                  style={miniInput}
                />
              </label>
              <label style={miniLabel}>
                배경
                <input
                  type="text"
                  value={headerLayout.background}
                  onChange={(e) =>
                    onApplyLayout({ ...headerLayout, background: e.target.value })
                  }
                  placeholder="transparent / #fff"
                  style={miniInput}
                />
              </label>
            </div>
          </Section>

          {/* 5. Languages */}
          <Section title="언어 스위처">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 6,
              }}
            >
              {VALID_LANGS.map((l) => {
                const checked = langs.includes(l.code);
                const isDefault = defaultLang === l.code;
                const isCurrent = currentLang === l.code;
                return (
                  <label
                    key={l.code}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 8px",
                      background: checked ? "rgba(42,121,255,0.15)" : "#0f1117",
                      border: checked ? "1px solid #2a79ff" : "1px solid #2a2d3a",
                      borderRadius: 4,
                      fontSize: 12,
                      cursor: "pointer",
                      color: "#e8eaf2",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setLangs((prev) =>
                          prev.includes(l.code)
                            ? prev.filter((c) => c !== l.code)
                            : [...prev, l.code],
                        )
                      }
                    />
                    <span style={{ flex: 1 }}>
                      {l.label}{" "}
                      <span style={{ color: "#666", fontSize: 10 }}>{l.code}</span>
                    </span>
                    {checked && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setDefaultLang(l.code);
                        }}
                        style={{
                          padding: "1px 4px",
                          fontSize: 9,
                          borderRadius: 3,
                          border: isDefault ? "1px solid #2a79ff" : "1px solid #2a2d3a",
                          background: isDefault ? "#2a79ff" : "transparent",
                          color: isDefault ? "#fff" : "#888",
                          cursor: "pointer",
                        }}
                      >
                        {isDefault ? "기본" : "기본으로"}
                      </button>
                    )}
                    {isCurrent && (
                      <span
                        title="편집 중"
                        style={{ color: "#3ccf97", fontSize: 9 }}
                      >
                        ●
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <button
                type="button"
                onClick={saveLanguages}
                disabled={langSaving}
                style={primaryBtn(langSaving)}
              >
                {langSaving ? "저장 중…" : "언어 저장"}
              </button>
              {langMsg && (
                <span
                  style={{
                    fontSize: 11,
                    color: langMsg.startsWith("저장됨") ? "#3ccf97" : "#ff6b6b",
                  }}
                >
                  {langMsg}
                </span>
              )}
            </div>
          </Section>

          {/* 6. Reset */}
          <Section title="고급">
            <button
              type="button"
              onClick={resetHeader}
              style={dangerBtn}
            >
              <i className="fa-solid fa-rotate-left" style={{ marginRight: 6 }} />
              헤더를 템플릿 초기 상태로 되돌리기
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
            ⌘S 로 사이트 저장하면 모든 변경이 영구 반영됩니다.
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
            완료
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Style helpers ────────────────────────────────────────────── */

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
      <h4 style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.4 }}>
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: "#888",
        marginBottom: 4,
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
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
  width: 110,
  padding: "5px 8px",
  background: "#0f1117",
  color: "#e8eaf2",
  border: "1px solid #2a2d3a",
  borderRadius: 4,
  fontSize: 11,
};

const primaryBtn = (busy: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  background: "#2a79ff",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: busy ? "wait" : "pointer",
  fontSize: 12,
  fontWeight: 500,
  opacity: busy ? 0.6 : 1,
  display: "inline-flex",
  alignItems: "center",
});

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

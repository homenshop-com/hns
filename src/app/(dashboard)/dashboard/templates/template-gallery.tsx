"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

interface TemplateItem {
  id: string;
  name: string;
  path: string;
  thumbnailUrl: string | null;
  category: string | null;
  price: number;
  isPublic?: boolean;
  demoSiteId?: string | null;
  /** true = built mobile-responsive (newer templates). false = legacy fixed-width. */
  isResponsive?: boolean;
}

interface TemplateGalleryProps {
  templates: TemplateItem[];
  myTemplates: TemplateItem[];
  totalCount: number;
  currentSort: string;
  currentKeyword: string;
  currentType?: string;
  emailVerified: boolean;
  labels: {
    total: string;
    count: string;
    selectTemplate: string;
    free: string;
    search: string;
    keyword: string;
    sortNewest: string;
    sortOldest: string;
    sortName: string;
    sortPopular: string;
    freeDesign: string;
    paidDesign: string;
    selectDesign: string;
    templateNotice1: string;
    templateNotice2: string;
    defaultLanguage: string;
    subdomainSetup: string;
    subdomainPrefix: string;
    subdomainHint: string;
    createSite: string;
    creating: string;
    langKo: string;
    langEn: string;
    langZhCn: string;
    langJa: string;
    langZhTw: string;
    langEs: string;
    errorShopIdRequired: string;
    errorShopIdFormat: string;
    errorShopIdTaken: string;
    errorAlreadyHasSite: string;
    tabPublic: string;
    tabMy: string;
    myTemplatesEmpty: string;
    uploadTemplate: string;
    templateName: string;
    templateNamePlaceholder: string;
    htmlFiles: string;
    cssFile: string;
    assetFiles: string;
    uploading: string;
    uploadSuccess: string;
    uploadError: string;
    deleteTemplate: string;
    deleteConfirm: string;
    emailVerifyRequired: string;
    emailVerifyMessage: string;
    emailVerifyResend: string;
    emailVerifySent: string;
  };
}

type ModalStep = null | "preview" | "setup" | "verify";
type Tab = "public" | "my";

export default function TemplateGallery({
  templates,
  myTemplates: initialMyTemplates,
  totalCount,
  currentSort,
  currentKeyword,
  currentType = "",
  emailVerified,
  labels,
}: TemplateGalleryProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("public");
  const [keyword, setKeyword] = useState(currentKeyword);
  const [modalStep, setModalStep] = useState<ModalStep>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [language, setLanguage] = useState("ko");
  const [shopId, setShopId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Upload state
  const [myTemplates, setMyTemplates] = useState<TemplateItem[]>(initialMyTemplates);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const htmlRef = useRef<HTMLInputElement>(null);
  const cssRef = useRef<HTMLInputElement>(null);
  const assetRef = useRef<HTMLInputElement>(null);

  // Per-card kebab menu (My templates) — id of the card whose menu is open
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenuId) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenuId(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [openMenuId]);

  // Edit-modal state (rename + re-upload thumbnail for an owner's template)
  const [editTarget, setEditTarget] = useState<TemplateItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editThumbUploading, setEditThumbUploading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editDragOver, setEditDragOver] = useState(false);
  const [editUrlInput, setEditUrlInput] = useState("");
  const editThumbRef = useRef<HTMLInputElement>(null);

  function openEditModal(tpl: TemplateItem) {
    setEditTarget(tpl);
    setEditName(tpl.name);
    setEditError("");
    setEditUrlInput("");
    setEditDragOver(false);
  }
  function closeEditModal() {
    if (editBusy || editThumbUploading) return;
    setEditTarget(null);
    setEditError("");
  }

  async function uploadThumbnailFile(file: File) {
    if (!editTarget) return;
    // Client-side guards that mirror the server (give faster feedback)
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)) {
      setEditError("이미지 파일만 업로드 가능합니다 (PNG/JPG/WEBP/GIF).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setEditError("파일 크기는 10MB 이하여야 합니다.");
      return;
    }

    setEditThumbUploading(true);
    setEditError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/templates/my/${editTarget.id}/thumbnail`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setEditError(err.error || `업로드 실패 (${res.status})`);
        return;
      }
      const data = await res.json();
      const newUrl: string = data.thumbnailUrl;
      setEditTarget({ ...editTarget, thumbnailUrl: newUrl });
      setMyTemplates((prev) =>
        prev.map((t) => (t.id === editTarget.id ? { ...t, thumbnailUrl: newUrl } : t))
      );
    } catch (err) {
      setEditError(String(err));
    } finally {
      setEditThumbUploading(false);
      if (editThumbRef.current) editThumbRef.current.value = "";
    }
  }

  function handleEditThumbnailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadThumbnailFile(file);
  }

  function handleEditThumbnailDrop(e: React.DragEvent) {
    e.preventDefault();
    setEditDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadThumbnailFile(file);
  }

  async function applyThumbnailUrl() {
    if (!editTarget) return;
    const url = editUrlInput.trim();
    if (!url) return;
    if (!/^(?:https?:\/\/|\/)/i.test(url)) {
      setEditError("URL은 http(s):// 또는 / 로 시작해야 합니다.");
      return;
    }
    setEditBusy(true);
    setEditError("");
    try {
      const res = await fetch(`/api/templates/my/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thumbnailUrl: url }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setEditError(err.error || `저장 실패 (${res.status})`);
        return;
      }
      const data = await res.json();
      const newUrl: string | null = data.template.thumbnailUrl;
      setEditTarget({ ...editTarget, thumbnailUrl: newUrl });
      setMyTemplates((prev) =>
        prev.map((t) => (t.id === editTarget.id ? { ...t, thumbnailUrl: newUrl } : t))
      );
      setEditUrlInput("");
    } catch (err) {
      setEditError(String(err));
    } finally {
      setEditBusy(false);
    }
  }

  async function clearThumbnail() {
    if (!editTarget) return;
    if (!editTarget.thumbnailUrl) return;
    if (!confirm("썸네일을 제거하시겠습니까?")) return;
    setEditBusy(true);
    setEditError("");
    try {
      const res = await fetch(`/api/templates/my/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thumbnailUrl: null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setEditError(err.error || `제거 실패 (${res.status})`);
        return;
      }
      setEditTarget({ ...editTarget, thumbnailUrl: null });
      setMyTemplates((prev) =>
        prev.map((t) => (t.id === editTarget.id ? { ...t, thumbnailUrl: null } : t))
      );
    } catch (err) {
      setEditError(String(err));
    } finally {
      setEditBusy(false);
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    if (!editName.trim()) {
      setEditError("이름을 입력해 주세요.");
      return;
    }
    if (editName.trim() === editTarget.name) {
      // Nothing to send (thumbnail already saved on upload)
      setEditTarget(null);
      return;
    }
    setEditBusy(true);
    setEditError("");
    try {
      const res = await fetch(`/api/templates/my/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setEditError(err.error || `저장 실패 (${res.status})`);
        setEditBusy(false);
        return;
      }
      const data = await res.json();
      const newName: string = data.template.name;
      setMyTemplates((prev) =>
        prev.map((t) => (t.id === editTarget.id ? { ...t, name: newName } : t))
      );
      setEditBusy(false);
      setEditTarget(null);
    } catch (err) {
      setEditError(String(err));
      setEditBusy(false);
    }
  }

  function handleSortChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const sort = e.target.value;
    const params = new URLSearchParams();
    if (sort && sort !== "newest") params.set("sort", sort);
    if (keyword) params.set("keyword", keyword);
    if (currentType) params.set("type", currentType);
    router.push(`/dashboard/templates?${params.toString()}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (currentSort && currentSort !== "newest") params.set("sort", currentSort);
    if (keyword) params.set("keyword", keyword);
    if (currentType) params.set("type", currentType);
    router.push(`/dashboard/templates?${params.toString()}`);
  }

  function handleTypeFilter(type: "" | "responsive" | "fixed") {
    const params = new URLSearchParams();
    if (currentSort && currentSort !== "newest") params.set("sort", currentSort);
    if (keyword) params.set("keyword", keyword);
    if (type) params.set("type", type);
    router.push(`/dashboard/templates?${params.toString()}`);
  }

  function openPreview(tpl: TemplateItem) {
    setSelectedTemplate(tpl);
    setModalStep("preview");
    setError("");
  }

  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  function goToSetup() {
    if (!emailVerified) {
      setModalStep("verify");
      return;
    }
    setModalStep("setup");
    setError("");
  }

  async function handleResendVerification() {
    setResending(true);
    setResendMsg("");
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      if (res.ok) {
        setResendMsg(labels.emailVerifySent);
      } else {
        const data = await res.json();
        setResendMsg(data.error || "Error");
      }
    } catch {
      setResendMsg("Error");
    } finally {
      setResending(false);
    }
  }

  function closeModal() {
    setModalStep(null);
    setSelectedTemplate(null);
    setShopId("");
    setError("");
    setCreating(false);
  }

  function validateShopId(value: string): boolean {
    return /^[a-z0-9][a-z0-9-]{4,12}[a-z0-9]$/.test(value);
  }

  async function handleCreateSite() {
    if (!selectedTemplate) return;
    setError("");

    if (!shopId.trim()) {
      setError(labels.errorShopIdRequired);
      return;
    }
    if (!validateShopId(shopId)) {
      setError(labels.errorShopIdFormat);
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/sites/create-from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          shopId,
          defaultLanguage: language,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error?.includes("shopId")) {
          setError(labels.errorShopIdTaken);
        } else if (res.status === 409) {
          setError(data.error || labels.errorShopIdTaken);
        } else {
          setError(data.error || "Failed to create site");
        }
        setCreating(false);
        return;
      }

      // Redirect to editor
      if (data.site?.pages?.[0]?.id) {
        router.push(`/dashboard/site/pages/${data.site.pages[0].id}/edit`);
      } else {
        router.push("/dashboard/site");
      }
    } catch {
      setError("Failed to create site");
      setCreating(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadName.trim()) return;
    const htmlFiles = htmlRef.current?.files;
    if (!htmlFiles?.length) return;

    setUploading(true);
    setUploadMsg("");

    const formData = new FormData();
    formData.append("name", uploadName.trim());
    for (let i = 0; i < htmlFiles.length; i++) {
      formData.append("htmlFiles", htmlFiles[i]);
    }
    const cssFiles = cssRef.current?.files;
    if (cssFiles?.length) {
      formData.append("cssFile", cssFiles[0]);
    }
    const assetFiles = assetRef.current?.files;
    if (assetFiles?.length) {
      for (let i = 0; i < assetFiles.length; i++) {
        formData.append("assets", assetFiles[i]);
      }
    }

    try {
      const res = await fetch("/api/templates/my", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadMsg(data.error || labels.uploadError);
        setUploading(false);
        return;
      }

      // Add to local list
      const tpl = data.template;
      setMyTemplates((prev) => [
        {
          id: tpl.id,
          name: tpl.name,
          path: tpl.path,
          thumbnailUrl: tpl.thumbnailUrl,
          category: tpl.category,
          price: tpl.price || 0,
        },
        ...prev,
      ]);
      setUploadMsg(labels.uploadSuccess);
      setUploadName("");
      if (htmlRef.current) htmlRef.current.value = "";
      if (cssRef.current) cssRef.current.value = "";
      if (assetRef.current) assetRef.current.value = "";
      setShowUpload(false);
    } catch {
      setUploadMsg(labels.uploadError);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm(labels.deleteConfirm)) return;
    try {
      const res = await fetch(`/api/templates/my?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setMyTemplates((prev) => prev.filter((t) => t.id !== id));
      }
    } catch {
      // ignore
    }
  }

  async function handleToggleVisibility(id: string, nextPublic: boolean) {
    const msg = nextPublic
      ? "이 템플릿을 공개 템플릿으로 전환하시겠습니까?\n다른 사용자도 이 템플릿으로 사이트를 만들 수 있게 됩니다."
      : "이 템플릿을 비공개로 되돌리시겠습니까?";
    if (!confirm(msg)) return;
    try {
      const res = await fetch(`/api/templates/my/${id}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: nextPublic }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`변경 실패: ${err.error || res.status}`);
        return;
      }
      setMyTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isPublic: nextPublic } : t))
      );
    } catch (e) {
      alert(`변경 실패: ${String(e)}`);
    }
  }

  const languages = [
    { code: "ko", label: labels.langKo },
    { code: "en", label: labels.langEn },
    { code: "zh-cn", label: labels.langZhCn },
    { code: "ja", label: labels.langJa },
    { code: "zh-tw", label: labels.langZhTw },
    { code: "es", label: labels.langEs },
  ];

  return (
    <>
      {/* TABS */}
      <div className="tpl-tabs">
        <button
          className={`tpl-tab ${tab === "public" ? "active" : ""}`}
          onClick={() => setTab("public")}
        >
          {labels.tabPublic}
        </button>
        <button
          className={`tpl-tab ${tab === "my" ? "active" : ""}`}
          onClick={() => setTab("my")}
        >
          {labels.tabMy}
          {myTemplates.length > 0 && (
            <span className="tpl-tab-badge">{myTemplates.length}</span>
          )}
        </button>
      </div>

      {/* ========== PUBLIC TAB ========== */}
      {tab === "public" && (
        <>
          {/* TOOLBAR */}
          <div className="tpl-toolbar">
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                defaultValue={currentSort}
                onChange={handleSortChange}
                style={{
                  height: 36,
                  padding: "0 12px",
                  fontSize: 13,
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  backgroundColor: "#fff",
                  color: "#1a1a2e",
                  cursor: "pointer",
                }}
              >
                <option value="newest">{labels.sortNewest}</option>
                <option value="oldest">{labels.sortOldest}</option>
                <option value="name">{labels.sortName}</option>
                <option value="popular">{labels.sortPopular}</option>
              </select>
              {/* Type filter — segmented control: 전체 / 반응형 / Fix형 */}
              <div
                role="group"
                aria-label="템플릿 유형 필터"
                style={{
                  display: "inline-flex",
                  background: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  padding: 2,
                  gap: 1,
                }}
              >
                {([
                  { v: "" as const, label: "전체" },
                  { v: "responsive" as const, label: "반응형" },
                  { v: "fixed" as const, label: "Fix형" },
                ]).map((opt) => {
                  const active = currentType === opt.v;
                  return (
                    <button
                      key={opt.v || "all"}
                      type="button"
                      onClick={() => handleTypeFilter(opt.v)}
                      aria-pressed={active}
                      style={{
                        padding: "6px 14px",
                        fontSize: 12.5,
                        fontWeight: active ? 700 : 500,
                        border: 0,
                        borderRadius: 4,
                        background: active ? "#fff" : "transparent",
                        color: active
                          ? opt.v === "responsive"
                            ? "#7b5cff"
                            : opt.v === "fixed"
                              ? "#475569"
                              : "#1a1a2e"
                          : "#64748b",
                        boxShadow: active ? "0 1px 2px rgba(15,18,38,0.08)" : "none",
                        cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="tpl-search">
              <form onSubmit={handleSearch} style={{ display: "flex", gap: 6 }}>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder={labels.keyword}
                />
                <button type="submit">{labels.search}</button>
              </form>
            </div>
          </div>

          {/* COUNT */}
          <div className="tpl-count" style={{ marginBottom: 16 }}>
            {labels.total}{" "}
            <strong style={{ color: "#e03131" }}>{totalCount}</strong>{" "}
            {labels.count}
          </div>

          {/* GRID */}
          <div className="tpl-grid">
            {templates.map((tpl) => (
              <div key={tpl.id} className="tpl-card">
                <div className="tpl-thumb">
                  {tpl.thumbnailUrl ? (
                    <Image
                      src={tpl.thumbnailUrl}
                      alt={tpl.name}
                      width={400}
                      height={250}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      unoptimized
                    />
                  ) : (
                    <div className="tpl-thumb-placeholder">🎨</div>
                  )}
                  {tpl.price === 0 && <span className="tpl-badge">FREE</span>}
                  {tpl.isResponsive ? (
                    <span
                      className="tpl-badge"
                      style={{
                        left: 8,
                        right: "auto",
                        background: "#7b5cff",
                        color: "#fff",
                      }}
                      title="모바일 반응형 디자인 — 한 레이아웃이 모든 화면에 자동 대응"
                    >
                      반응형
                    </span>
                  ) : (
                    <span
                      className="tpl-badge"
                      style={{
                        left: 8,
                        right: "auto",
                        background: "#94a3b8",
                        color: "#fff",
                      }}
                      title="고정 폭 디자인 — 데스크탑/모바일 별도 레이아웃 필요"
                    >
                      Fix형
                    </span>
                  )}
                </div>
                <div className="tpl-card-body">
                  <span className="tpl-card-name">{tpl.name}</span>
                  <span className="tpl-card-price">
                    {tpl.price === 0
                      ? labels.free
                      : `₩${tpl.price.toLocaleString()}`}
                  </span>
                </div>
                <div className="tpl-card-footer">
                  <button
                    className="tpl-select-btn"
                    onClick={() => openPreview(tpl)}
                  >
                    [{labels.selectTemplate}]
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ========== MY TEMPLATES TAB ========== */}
      {tab === "my" && (
        <>
          {/* UPLOAD TOGGLE */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button
              className="tpl-upload-btn"
              onClick={() => setShowUpload(!showUpload)}
            >
              + {labels.uploadTemplate}
            </button>
          </div>

          {/* UPLOAD FORM */}
          {showUpload && (
            <form onSubmit={handleUpload} className="tpl-upload-form">
              <div className="tpl-upload-field">
                <label>{labels.templateName}</label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder={labels.templateNamePlaceholder}
                  required
                />
              </div>
              <div className="tpl-upload-field">
                <label>{labels.htmlFiles} *</label>
                <input
                  ref={htmlRef}
                  type="file"
                  accept=".html,.htm"
                  multiple
                  required
                />
              </div>
              <div className="tpl-upload-field">
                <label>{labels.cssFile}</label>
                <input ref={cssRef} type="file" accept=".css" />
              </div>
              <div className="tpl-upload-field">
                <label>{labels.assetFiles}</label>
                <input ref={assetRef} type="file" multiple />
              </div>
              <button
                type="submit"
                className="tpl-upload-submit"
                disabled={uploading}
              >
                {uploading ? labels.uploading : labels.uploadTemplate}
              </button>
            </form>
          )}

          {uploadMsg && (
            <p
              style={{
                padding: "8px 12px",
                marginBottom: 12,
                borderRadius: 6,
                fontSize: 13,
                background: uploadMsg === labels.uploadSuccess ? "#d3f9d8" : "#ffe3e3",
                color: uploadMsg === labels.uploadSuccess ? "#2b8a3e" : "#c92a2a",
              }}
            >
              {uploadMsg}
            </p>
          )}

          {/* MY TEMPLATES GRID */}
          {myTemplates.length === 0 ? (
            <div className="tpl-empty">{labels.myTemplatesEmpty}</div>
          ) : (
            <div className="tpl-grid">
              {myTemplates.map((tpl) => (
                <div key={tpl.id} className="tpl-card">
                  <div className="tpl-thumb">
                    {tpl.thumbnailUrl ? (
                      <Image
                        src={tpl.thumbnailUrl}
                        alt={tpl.name}
                        width={400}
                        height={250}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        unoptimized
                      />
                    ) : (
                      <div className="tpl-thumb-placeholder">
                        <span style={{ fontSize: 32 }}>📄</span>
                      </div>
                    )}
                    <span className="tpl-badge" style={{ background: tpl.isPublic ? "#12b886" : "#228be6" }}>
                      {tpl.isPublic ? "PUBLIC" : "MY"}
                    </span>
                  </div>
                  <div className="tpl-card-body">
                    <span className="tpl-card-name">{tpl.name}</span>
                  </div>
                  <div
                    className="tpl-card-footer"
                    style={{ display: "flex", gap: 8, alignItems: "stretch", padding: "0 14px 14px" }}
                  >
                    <button
                      className="tpl-create-cta"
                      onClick={() => openPreview(tpl)}
                    >
                      이 템플릿으로 홈페이지 제작
                    </button>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <button
                        type="button"
                        className="tpl-kebab-btn"
                        aria-label="더보기"
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === tpl.id}
                        onClick={() =>
                          setOpenMenuId(openMenuId === tpl.id ? null : tpl.id)
                        }
                        title="더보기"
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <circle cx="5" cy="12" r="1.8" />
                          <circle cx="12" cy="12" r="1.8" />
                          <circle cx="19" cy="12" r="1.8" />
                        </svg>
                      </button>
                      {openMenuId === tpl.id && (
                        <div
                          ref={menuRef}
                          role="menu"
                          className="tpl-kebab-menu"
                        >
                          <Link
                            href={`/dashboard/templates/my/${tpl.id}/edit`}
                            role="menuitem"
                            className="tpl-kebab-item"
                            onClick={() => setOpenMenuId(null)}
                          >
                            <span className="tpl-kebab-ic" aria-hidden="true">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                              </svg>
                            </span>
                            디자인 수정
                          </Link>
                          <button
                            type="button"
                            role="menuitem"
                            className="tpl-kebab-item"
                            onClick={() => {
                              setOpenMenuId(null);
                              openEditModal(tpl);
                            }}
                          >
                            <span className="tpl-kebab-ic" aria-hidden="true">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                              </svg>
                            </span>
                            정보 수정
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="tpl-kebab-item"
                            onClick={() => {
                              setOpenMenuId(null);
                              handleToggleVisibility(tpl.id, !tpl.isPublic);
                            }}
                          >
                            <span className="tpl-kebab-ic" aria-hidden="true">
                              {tpl.isPublic ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                  <line x1="1" y1="1" x2="23" y2="23" />
                                </svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              )}
                            </span>
                            {tpl.isPublic ? "비공개로 전환" : "공개로 전환"}
                          </button>
                          <div className="tpl-kebab-sep" />
                          <button
                            type="button"
                            role="menuitem"
                            className="tpl-kebab-item tpl-kebab-danger"
                            onClick={() => {
                              setOpenMenuId(null);
                              handleDeleteTemplate(tpl.id);
                            }}
                          >
                            <span className="tpl-kebab-ic" aria-hidden="true">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            </span>
                            {labels.deleteTemplate}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* MODAL OVERLAY */}
      {modalStep && selectedTemplate && (
        <div className="tpl-modal-overlay" onClick={closeModal}>
          <div
            className="tpl-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="tpl-modal-close" onClick={closeModal}>
              ×
            </button>

            {/* STEP 1: PREVIEW */}
            {modalStep === "preview" && (
              <div className="tpl-modal-preview">
                <div className="tpl-modal-thumb">
                  {selectedTemplate.thumbnailUrl ? (
                    <Image
                      src={selectedTemplate.thumbnailUrl}
                      alt={selectedTemplate.name}
                      width={520}
                      height={340}
                      style={{
                        width: "100%",
                        height: "auto",
                        objectFit: "contain",
                      }}
                      unoptimized
                    />
                  ) : (
                    <div
                      style={{
                        height: 300,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#f0f0f0",
                        fontSize: 48,
                      }}
                    >
                      🎨
                    </div>
                  )}
                </div>
                <h3 className="tpl-modal-name">{selectedTemplate.name}</h3>
                <p className="tpl-modal-price">
                  {selectedTemplate.price === 0
                    ? labels.freeDesign
                    : `₩${selectedTemplate.price.toLocaleString()}`}
                </p>
                <button className="tpl-modal-action" onClick={goToSetup}>
                  [ {labels.selectDesign} ]
                </button>
                {error && <p className="tpl-modal-error">{error}</p>}
              </div>
            )}

            {/* STEP: EMAIL VERIFY */}
            {modalStep === "verify" && (
              <div style={{ padding: "40px 32px", textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>&#x2709;&#xFE0F;</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e", marginBottom: 12 }}>
                  {labels.emailVerifyRequired}
                </h3>
                <p style={{ fontSize: 14, color: "#4a5568", lineHeight: 1.7, marginBottom: 24 }}>
                  {labels.emailVerifyMessage}
                </p>
                <button
                  onClick={handleResendVerification}
                  disabled={resending}
                  style={{
                    padding: "10px 24px",
                    fontSize: 14,
                    fontWeight: 600,
                    background: "#1a1a2e",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    cursor: resending ? "default" : "pointer",
                    opacity: resending ? 0.6 : 1,
                  }}
                >
                  {resending ? "..." : labels.emailVerifyResend}
                </button>
                {resendMsg && (
                  <p style={{ fontSize: 13, color: resendMsg === labels.emailVerifySent ? "#2b8a3e" : "#c92a2a", marginTop: 12 }}>
                    {resendMsg}
                  </p>
                )}
              </div>
            )}

            {/* STEP 2: SETUP */}
            {modalStep === "setup" && (
              <div className="tpl-modal-setup">
                <div className="tpl-modal-notices">
                  <p>- {labels.templateNotice1}</p>
                  <p>- {labels.templateNotice2}</p>
                </div>

                <div className="tpl-modal-field">
                  <label>{labels.defaultLanguage}:</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    style={{
                      height: 36,
                      padding: "0 12px",
                      fontSize: 14,
                      border: "1px solid #d4d4d8",
                      borderRadius: 6,
                      backgroundColor: "#fff",
                      color: "#1a1a2e",
                    }}
                  >
                    {languages.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>

                <h4 className="tpl-modal-subtitle">{labels.subdomainSetup}</h4>
                <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "12px 0" }} />

                <div className="tpl-modal-domain">
                  <span className="tpl-modal-domain-prefix">
                    {labels.subdomainPrefix}
                  </span>
                  <input
                    type="text"
                    value={shopId}
                    onChange={(e) => {
                      setShopId(e.target.value.toLowerCase());
                      setError("");
                    }}
                    placeholder=""
                    maxLength={14}
                    style={{
                      height: 36,
                      padding: "0 12px",
                      fontSize: 14,
                      border: "1px solid #d4d4d8",
                      borderRadius: 6,
                      flex: 1,
                      minWidth: 120,
                    }}
                  />
                </div>
                <p className="tpl-modal-hint">{labels.subdomainHint}</p>

                {error && <p className="tpl-modal-error">{error}</p>}

                <button
                  className="tpl-modal-create"
                  onClick={handleCreateSite}
                  disabled={creating}
                >
                  {creating ? labels.creating : labels.createSite}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EDIT MODAL (name + thumbnail for owner's templates) */}
      {editTarget && (
        <div
          onClick={closeEditModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitEdit}
            style={{
              background: "#fff",
              borderRadius: 10,
              width: "100%",
              maxWidth: 520,
              padding: 24,
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
              color: "#1f2937",
            }}
          >
            <h3 style={{ margin: 0, marginBottom: 6, fontSize: 18, fontWeight: 700 }}>
              템플릿 수정
            </h3>
            <p style={{ margin: 0, marginBottom: 18, fontSize: 13, color: "#6b7280" }}>
              이름과 썸네일을 변경할 수 있습니다. 썸네일 업로드는 즉시 반영됩니다.
            </p>

            {editError && (
              <div style={{ background: "#fef2f2", color: "#991b1b", padding: "8px 12px", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
                {editError}
              </div>
            )}

            {/* Thumbnail — dropzone + click upload + URL paste */}
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              썸네일
            </label>
            <div
              onClick={() => editThumbRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setEditDragOver(true); }}
              onDragLeave={() => setEditDragOver(false)}
              onDrop={handleEditThumbnailDrop}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  editThumbRef.current?.click();
                }
              }}
              style={{
                position: "relative",
                width: "100%",
                height: 160,
                borderRadius: 8,
                border: `2px dashed ${editDragOver ? "#1971c2" : "#d1d5db"}`,
                background: editDragOver ? "#e7f5ff" : editTarget.thumbnailUrl ? "#fff" : "#f9fafb",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                cursor: editThumbUploading ? "progress" : "pointer",
                marginBottom: 8,
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              {editTarget.thumbnailUrl && !editThumbUploading && (
                <Image
                  src={editTarget.thumbnailUrl}
                  alt={editTarget.name}
                  width={480}
                  height={160}
                  unoptimized
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              )}
              {/* overlay hint (always visible over the preview for affordance) */}
              <div
                style={{
                  position: editTarget.thumbnailUrl ? "absolute" : "static",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  background: editTarget.thumbnailUrl
                    ? "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 100%)"
                    : "transparent",
                  color: editTarget.thumbnailUrl ? "#fff" : "#374151",
                  padding: 12,
                  textAlign: "center",
                }}
              >
                {editThumbUploading ? (
                  <>
                    <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>업로드 중...</span>
                  </>
                ) : (
                  <>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {editTarget.thumbnailUrl ? "이미지 변경 — 클릭 또는 드래그" : "클릭하여 업로드 또는 여기로 드래그"}
                    </div>
                    <div style={{ fontSize: 11, opacity: editTarget.thumbnailUrl ? 0.9 : 0.6 }}>
                      PNG · JPG · WEBP · GIF · 최대 10MB
                    </div>
                  </>
                )}
              </div>
              <input
                ref={editThumbRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleEditThumbnailChange}
                disabled={editThumbUploading}
                style={{ display: "none" }}
              />
            </div>

            {/* URL 직접 입력 + 제거 액션 */}
            <div style={{ display: "flex", gap: 6, marginBottom: 18, alignItems: "center" }}>
              <input
                type="url"
                value={editUrlInput}
                onChange={(e) => setEditUrlInput(e.target.value)}
                placeholder="또는 이미지 URL 붙여넣기 (https://...)"
                disabled={editBusy || editThumbUploading}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  fontSize: 12,
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={applyThumbnailUrl}
                disabled={!editUrlInput.trim() || editBusy || editThumbUploading}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  background: "#fff",
                  color: "#1971c2",
                  border: "1px solid #a5d8ff",
                  borderRadius: 6,
                  cursor: editUrlInput.trim() ? "pointer" : "default",
                  opacity: editUrlInput.trim() ? 1 : 0.6,
                }}
              >
                URL 적용
              </button>
              {editTarget.thumbnailUrl && (
                <button
                  type="button"
                  onClick={clearThumbnail}
                  disabled={editBusy || editThumbUploading}
                  style={{
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    background: "#fff",
                    color: "#c92a2a",
                    border: "1px solid #ffc9c9",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                  title="썸네일 제거"
                >
                  제거
                </button>
              )}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                템플릿 이름 <span style={{ color: "#e03131" }}>*</span>
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={100}
                required
                autoFocus
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 14,
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={closeEditModal}
                disabled={editBusy || editThumbUploading}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  background: "#fff",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  cursor: editBusy || editThumbUploading ? "default" : "pointer",
                }}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={editBusy || editThumbUploading}
                style={{
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  background: editBusy ? "#9ca3af" : "#228be6",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: editBusy || editThumbUploading ? "default" : "pointer",
                }}
              >
                {editBusy ? "저장 중..." : "이름 저장"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import Image from "next/image";

interface TemplateItem {
  id: string;
  name: string;
  path: string;
  thumbnailUrl: string | null;
  category: string | null;
  price: number;
  isPublic?: boolean;
}

interface TemplateGalleryProps {
  templates: TemplateItem[];
  myTemplates: TemplateItem[];
  totalCount: number;
  currentSort: string;
  currentKeyword: string;
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

  // Edit-modal state (rename + re-upload thumbnail for an owner's template)
  const [editTarget, setEditTarget] = useState<TemplateItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editThumbUploading, setEditThumbUploading] = useState(false);
  const [editError, setEditError] = useState("");
  const editThumbRef = useRef<HTMLInputElement>(null);

  function openEditModal(tpl: TemplateItem) {
    setEditTarget(tpl);
    setEditName(tpl.name);
    setEditError("");
  }
  function closeEditModal() {
    if (editBusy || editThumbUploading) return;
    setEditTarget(null);
    setEditError("");
  }

  async function handleEditThumbnail(e: React.ChangeEvent<HTMLInputElement>) {
    if (!editTarget) return;
    const file = e.target.files?.[0];
    if (!file) return;
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
      // Update both the open modal's target and the list
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
    router.push(`/dashboard/templates?${params.toString()}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (currentSort && currentSort !== "newest") params.set("sort", currentSort);
    if (keyword) params.set("keyword", keyword);
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
            <div>
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
                  <div className="tpl-card-footer" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="tpl-select-btn"
                      onClick={() => openPreview(tpl)}
                    >
                      [{labels.selectTemplate}]
                    </button>
                    <button
                      className="tpl-delete-btn"
                      onClick={() => openEditModal(tpl)}
                      style={{
                        background: "#f1f3f5",
                        color: "#495057",
                        border: "1px solid #dee2e6",
                      }}
                      title="이름 수정 / 썸네일 교체"
                    >
                      수정
                    </button>
                    <button
                      className="tpl-delete-btn"
                      onClick={() => handleToggleVisibility(tpl.id, !tpl.isPublic)}
                      style={{
                        background: tpl.isPublic ? "#fff0f0" : "#e7f5ff",
                        color: tpl.isPublic ? "#c92a2a" : "#1971c2",
                        border: `1px solid ${tpl.isPublic ? "#ffc9c9" : "#a5d8ff"}`,
                      }}
                      title={tpl.isPublic ? "비공개로 되돌리기" : "공개 템플릿으로 전환"}
                    >
                      {tpl.isPublic ? "비공개로" : "공개로 전환"}
                    </button>
                    <button
                      className="tpl-delete-btn"
                      onClick={() => handleDeleteTemplate(tpl.id)}
                    >
                      {labels.deleteTemplate}
                    </button>
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

            {/* Thumbnail preview + upload */}
            <div style={{ marginBottom: 18, display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 160,
                  height: 100,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#f3f4f6",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {editTarget.thumbnailUrl ? (
                  <Image
                    src={editTarget.thumbnailUrl}
                    alt={editTarget.name}
                    width={160}
                    height={100}
                    unoptimized
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span style={{ color: "#9ca3af", fontSize: 24 }}>📄</span>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  썸네일
                </label>
                <input
                  ref={editThumbRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleEditThumbnail}
                  disabled={editThumbUploading}
                  style={{ fontSize: 13 }}
                />
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "#9ca3af" }}>
                  PNG/JPG/WEBP/GIF · 최대 10MB · 중간 크기(450px)로 저장됩니다.
                </p>
                {editThumbUploading && (
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "#1971c2" }}>
                    업로드 중...
                  </p>
                )}
              </div>
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

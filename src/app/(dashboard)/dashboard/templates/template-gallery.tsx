"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";

interface TemplateItem {
  id: string;
  name: string;
  path: string;
  thumbnailUrl: string | null;
  category: string | null;
  price: number;
}

interface TemplateGalleryProps {
  templates: TemplateItem[];
  totalCount: number;
  currentSort: string;
  currentKeyword: string;
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
  };
}

type ModalStep = null | "preview" | "setup";

export default function TemplateGallery({
  templates,
  totalCount,
  currentSort,
  currentKeyword,
  labels,
}: TemplateGalleryProps) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(currentKeyword);
  const [modalStep, setModalStep] = useState<ModalStep>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [language, setLanguage] = useState("ko");
  const [shopId, setShopId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

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

  function goToSetup() {
    setModalStep("setup");
    setError("");
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
    </>
  );
}

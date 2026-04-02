"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { pageTemplates } from "@/lib/page-templates";

const THUMB_COLORS: Record<string, string> = {
  blank: "linear-gradient(135deg, #f8f9fa, #e9ecef)",
  landing: "linear-gradient(135deg, #667eea, #764ba2)",
  shop: "linear-gradient(135deg, #f5f0eb, #e8ddd3)",
  portfolio: "linear-gradient(135deg, #111, #333)",
};

const THUMB_ICONS: Record<string, string> = {
  blank: "\u{1F4C4}",
  landing: "\u{1F3E0}",
  shop: "\u{1F6D2}",
  portfolio: "\u{1F3A8}",
};

export default function TemplateGallery({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const templates = pageTemplates.filter(
    (t) =>
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSelect(templateId: string) {
    setLoading(templateId);

    try {
      let siteId: string | null = null;

      // Create site first
      const siteRes = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "내 홈페이지" }),
      });

      if (siteRes.ok) {
        const siteData = await siteRes.json();
        siteId = siteData.id;
      } else {
        // Site might already exist
        const existRes = await fetch("/api/sites");
        const existData = await existRes.json();
        siteId = existData?.id || null;
      }

      if (!siteId) {
        alert("사이트를 생성할 수 없습니다.");
        setLoading(null);
        return;
      }

      const template = pageTemplates.find((t) => t.id === templateId);

      // Create the default page with template
      const pageRes = await fetch(`/api/sites/${siteId}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "홈",
          slug: "home",
          isHome: true,
          content: template?.html || "",
          css: template?.css || "",
        }),
      });

      if (pageRes.ok) {
        const pageData = await pageRes.json();
        router.push(`/dashboard/site/pages/${pageData.id}/edit`);
      } else {
        router.push("/dashboard/site");
      }

      router.refresh();
    } catch {
      alert("오류가 발생했습니다.");
      setLoading(null);
    }
  }

  return (
    <>
      <div className="tpl-toolbar">
        <div className="tpl-count">
          총 <strong>{templates.length}</strong>개
        </div>
        <div className="tpl-search">
          <input
            type="text"
            placeholder="키워드"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button">검색</button>
        </div>
      </div>

      <div className="tpl-grid">
        {templates.map((tpl) => (
          <div key={tpl.id} className="tpl-card">
            <div className="tpl-thumb">
              <div
                className="tpl-thumb-placeholder"
                style={{ background: THUMB_COLORS[tpl.id] || "#f0f0f0" }}
              >
                <span style={{ fontSize: 48 }}>{THUMB_ICONS[tpl.id] || "\u{1F4C4}"}</span>
              </div>
              <span className="tpl-badge">FREE</span>
            </div>
            <div className="tpl-card-body">
              <span className="tpl-card-name">{tpl.name}</span>
              <span className="tpl-card-price">무료</span>
            </div>
            <div className="tpl-card-footer">
              <span style={{ fontSize: 12, color: "#868e96" }}>{tpl.description}</span>
              <button
                className="tpl-select-btn"
                onClick={() => handleSelect(tpl.id)}
                disabled={loading !== null}
              >
                {loading === tpl.id ? "..." : "[디자인선택]"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

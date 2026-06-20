"use client";

/**
 * AEO 콘텐츠 에디터 ('AEO 콘텐츠' 탭).
 *
 * 페이지별로 FAQ / HowTo / 핵심요약(TL;DR) / 정의 블록을 편집·저장한다.
 * 저장 시 PUT /api/sites/:id/pages/:pageId { aeoBlocks } 로 보내고,
 * 퍼블리시된 페이지가 JSON-LD(FAQPage/HowTo/DefinedTerm) + 가시 섹션으로 렌더.
 */

import { useState } from "react";

type FaqItem = { q: string; a: string };
type Step = { name?: string; text: string };
type Block =
  | { type: "faq"; items: FaqItem[] }
  | { type: "howto"; name: string; steps: Step[] }
  | { type: "tldr"; title?: string; points: string[] }
  | { type: "definition"; term: string; definition: string };

interface PageItem {
  id: string;
  title: string;
  slug: string;
  isHome: boolean;
  blocks: Block[];
}

interface Props {
  siteId: string;
  pages: PageItem[];
}

const TYPE_LABEL: Record<Block["type"], string> = {
  faq: "FAQ",
  howto: "HowTo (단계)",
  tldr: "핵심 요약",
  definition: "정의",
};
const TYPE_ICON: Record<Block["type"], string> = {
  faq: "fa-circle-question",
  howto: "fa-list-ol",
  tldr: "fa-bolt",
  definition: "fa-book",
};

function emptyBlock(type: Block["type"]): Block {
  if (type === "faq") return { type: "faq", items: [{ q: "", a: "" }] };
  if (type === "howto") return { type: "howto", name: "", steps: [{ text: "" }] };
  if (type === "tldr") return { type: "tldr", title: "", points: [""] };
  return { type: "definition", term: "", definition: "" };
}

export default function AeoEditor({ siteId, pages }: Props) {
  const [selId, setSelId] = useState<string>(pages[0]?.id ?? "");
  const [map, setMap] = useState<Record<string, Block[]>>(() =>
    Object.fromEntries(pages.map((p) => [p.id, p.blocks])),
  );
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (pages.length === 0) {
    return (
      <div className="seo-soon" style={{ borderStyle: "solid" }}>
        <p className="t">편집할 페이지가 없습니다</p>
        <p className="p">먼저 사이트에 페이지를 만들어 주세요.</p>
      </div>
    );
  }

  const blocks = map[selId] ?? [];
  const setBlocks = (next: Block[]) => {
    setMap((m) => ({ ...m, [selId]: next }));
    setDirty((d) => ({ ...d, [selId]: true }));
    setSavedAt(null);
  };
  const updateBlock = (i: number, patch: Partial<Block>) =>
    setBlocks(blocks.map((b, idx) => (idx === i ? ({ ...b, ...patch } as Block) : b)));
  const removeBlock = (i: number) => setBlocks(blocks.filter((_, idx) => idx !== i));
  const addBlock = (type: Block["type"]) => setBlocks([...blocks, emptyBlock(type)]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/pages/${selId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aeoBlocks: blocks }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "저장에 실패했습니다.");
        return;
      }
      setDirty((d) => ({ ...d, [selId]: false }));
      const now = new Date();
      setSavedAt(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="aeo-ed">
      <div className="aeo-ed-bar">
        <label className="aeo-ed-pagesel">
          <span>페이지</span>
          <select value={selId} onChange={(e) => setSelId(e.target.value)}>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title || p.slug}
                {p.isHome ? " (홈)" : ""}
                {dirty[p.id] ? " ●" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="aeo-ed-actions">
          {savedAt && <span className="saved">저장됨 {savedAt}</span>}
          <button className="save" onClick={save} disabled={saving || !dirty[selId]}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>

      {error && (
        <div className="seo-vis-error">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" style={{ marginRight: 6 }} />
          {error}
        </div>
      )}

      <div className="aeo-ed-add">
        {(Object.keys(TYPE_LABEL) as Block["type"][]).map((t) => (
          <button key={t} onClick={() => addBlock(t)}>
            <i className={`fa-solid ${TYPE_ICON[t]}`} aria-hidden="true" style={{ marginRight: 6 }} />
            {TYPE_LABEL[t]} 추가
          </button>
        ))}
      </div>

      {blocks.length === 0 ? (
        <div className="aeo-ed-empty">
          이 페이지에 AEO 블록이 없습니다. 위 버튼으로 FAQ·HowTo·핵심요약·정의를 추가하세요.
          <br />
          AI 답변 엔진이 그대로 발췌·인용하기 쉬운 구조화 콘텐츠가 만들어지고, 구조화 데이터(JSON-LD)가
          자동 발행됩니다.
        </div>
      ) : (
        <div className="aeo-ed-list">
          {blocks.map((b, i) => (
            <div key={i} className="aeo-card">
              <div className="aeo-card-hd">
                <span className="tt">
                  <i className={`fa-solid ${TYPE_ICON[b.type]}`} aria-hidden="true" /> {TYPE_LABEL[b.type]}
                </span>
                <button className="rm" onClick={() => removeBlock(i)} aria-label="블록 삭제">
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>

              {b.type === "faq" && (
                <div className="aeo-rows">
                  {b.items.map((it, j) => (
                    <div key={j} className="aeo-row">
                      <input
                        placeholder="질문"
                        value={it.q}
                        onChange={(e) =>
                          updateBlock(i, {
                            items: b.items.map((x, k) => (k === j ? { ...x, q: e.target.value } : x)),
                          } as Partial<Block>)
                        }
                      />
                      <textarea
                        placeholder="답변"
                        rows={2}
                        value={it.a}
                        onChange={(e) =>
                          updateBlock(i, {
                            items: b.items.map((x, k) => (k === j ? { ...x, a: e.target.value } : x)),
                          } as Partial<Block>)
                        }
                      />
                      <button
                        className="rm-row"
                        onClick={() => updateBlock(i, { items: b.items.filter((_, k) => k !== j) } as Partial<Block>)}
                        aria-label="항목 삭제"
                      >
                        <i className="fa-solid fa-trash" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <button className="add-row" onClick={() => updateBlock(i, { items: [...b.items, { q: "", a: "" }] } as Partial<Block>)}>
                    <i className="fa-solid fa-plus" aria-hidden="true" /> 질문 추가
                  </button>
                </div>
              )}

              {b.type === "howto" && (
                <div className="aeo-rows">
                  <input
                    className="aeo-title"
                    placeholder="가이드 제목 (예: 주문 방법)"
                    value={b.name}
                    onChange={(e) => updateBlock(i, { name: e.target.value } as Partial<Block>)}
                  />
                  {b.steps.map((s, j) => (
                    <div key={j} className="aeo-row">
                      <input
                        placeholder="단계 이름 (선택)"
                        value={s.name ?? ""}
                        onChange={(e) =>
                          updateBlock(i, {
                            steps: b.steps.map((x, k) => (k === j ? { ...x, name: e.target.value } : x)),
                          } as Partial<Block>)
                        }
                      />
                      <textarea
                        placeholder="단계 설명"
                        rows={2}
                        value={s.text}
                        onChange={(e) =>
                          updateBlock(i, {
                            steps: b.steps.map((x, k) => (k === j ? { ...x, text: e.target.value } : x)),
                          } as Partial<Block>)
                        }
                      />
                      <button
                        className="rm-row"
                        onClick={() => updateBlock(i, { steps: b.steps.filter((_, k) => k !== j) } as Partial<Block>)}
                        aria-label="단계 삭제"
                      >
                        <i className="fa-solid fa-trash" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <button className="add-row" onClick={() => updateBlock(i, { steps: [...b.steps, { text: "" }] } as Partial<Block>)}>
                    <i className="fa-solid fa-plus" aria-hidden="true" /> 단계 추가
                  </button>
                </div>
              )}

              {b.type === "tldr" && (
                <div className="aeo-rows">
                  <input
                    className="aeo-title"
                    placeholder="제목 (비우면 '핵심 요약')"
                    value={b.title ?? ""}
                    onChange={(e) => updateBlock(i, { title: e.target.value } as Partial<Block>)}
                  />
                  {b.points.map((p, j) => (
                    <div key={j} className="aeo-row">
                      <input
                        placeholder="핵심 포인트"
                        value={p}
                        onChange={(e) =>
                          updateBlock(i, {
                            points: b.points.map((x, k) => (k === j ? e.target.value : x)),
                          } as Partial<Block>)
                        }
                      />
                      <button
                        className="rm-row"
                        onClick={() => updateBlock(i, { points: b.points.filter((_, k) => k !== j) } as Partial<Block>)}
                        aria-label="포인트 삭제"
                      >
                        <i className="fa-solid fa-trash" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <button className="add-row" onClick={() => updateBlock(i, { points: [...b.points, ""] } as Partial<Block>)}>
                    <i className="fa-solid fa-plus" aria-hidden="true" /> 포인트 추가
                  </button>
                </div>
              )}

              {b.type === "definition" && (
                <div className="aeo-rows">
                  <input
                    placeholder="용어"
                    value={b.term}
                    onChange={(e) => updateBlock(i, { term: e.target.value } as Partial<Block>)}
                  />
                  <textarea
                    placeholder="정의 / 설명"
                    rows={3}
                    value={b.definition}
                    onChange={(e) => updateBlock(i, { definition: e.target.value } as Partial<Block>)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

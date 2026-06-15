"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface InboxRow {
  id: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string | null;
  forwarded: boolean;
  isSpam: boolean;
  isRead: boolean;
  tags: string[];
  spamScore: number;
  spamReasons: string[];
  deletedAt: string | null;
  createdAt: string;
}

export interface SelectedEmail {
  id: string;
  subject: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  cc: string | null;
  text: string | null;
  html: string | null;
  isSpam: boolean;
  tags: string[];
  spamScore: number;
  spamReasons: string[];
  deletedAt: string | null;
  createdAt: string;
}

const SUSPECT_THRESHOLD = 30;

type View = "inbox" | "spam" | "trash" | "all";

const VIEW_LABEL: Record<View, string> = {
  inbox: "수신함",
  spam: "스팸",
  trash: "휴지통",
  all: "전체",
};

export default function InboxClient({
  emails,
  selected,
  view,
  counts,
  allTags,
}: {
  emails: InboxRow[];
  selected: SelectedEmail | null;
  view: View;
  counts: { inbox: number; spam: number; trash: number; all: number };
  allTags: string[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const allOnPage = useMemo(() => emails.map((e) => e.id), [emails]);
  const allChecked =
    allOnPage.length > 0 && allOnPage.every((id) => picked.has(id));

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allChecked) {
      setPicked(new Set());
    } else {
      setPicked(new Set(allOnPage));
    }
  }

  async function run(
    action:
      | "spam"
      | "unspam"
      | "delete"
      | "restore"
      | "purge"
      | "markRead"
      | "markUnread"
      | "addTag"
      | "removeTag"
      | "reclassify",
    tag?: string
  ) {
    const ids = Array.from(picked);
    if (ids.length === 0) {
      alert("이메일을 선택하세요.");
      return;
    }
    if (action === "purge") {
      if (
        !confirm(
          `선택한 ${ids.length}건을 영구 삭제합니다. 복구할 수 없습니다. 계속할까요?`
        )
      ) {
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action, tag }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`실패: ${j.error || res.statusText}`);
        return;
      }
      if (action === "reclassify") {
        const j = await res.json().catch(() => ({}));
        const moved = typeof j.movedToSpam === "number" ? j.movedToSpam : 0;
        alert(`재분류 완료: ${j.count ?? 0}건, 스팸 이동 ${moved}건`);
      }
      setPicked(new Set());
      setTagInput("");
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  function changeView(v: View) {
    setPicked(new Set());
    const params = new URLSearchParams();
    if (v !== "inbox") params.set("view", v);
    const qs = params.toString();
    router.push(`/admin/inbox${qs ? `?${qs}` : ""}`);
  }

  const disabled = busy || pending;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">이메일 수신함</h1>
        <div className="flex gap-1 text-sm">
          {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => changeView(v)}
              className={`px-3 py-1.5 rounded-md border transition ${
                view === v
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {VIEW_LABEL[v]}
              <span
                className={`ml-1.5 text-xs ${
                  view === v ? "text-slate-300" : "text-slate-400"
                }`}
              >
                {counts[v]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 mb-3 flex items-center gap-2 flex-wrap text-sm">
        <label className="flex items-center gap-2 px-2 py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            className="rounded border-slate-300"
          />
          <span className="text-slate-500 text-xs">
            {picked.size > 0 ? `${picked.size}개 선택` : "전체"}
          </span>
        </label>

        <div className="h-5 w-px bg-slate-200" />

        {view !== "trash" ? (
          <>
            {view !== "spam" && (
              <button
                type="button"
                onClick={() => run("spam")}
                disabled={disabled || picked.size === 0}
                className="px-2.5 py-1 rounded border border-slate-200 hover:bg-amber-50 hover:border-amber-300 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-slate-200"
              >
                스팸 처리
              </button>
            )}
            {view === "spam" && (
              <button
                type="button"
                onClick={() => run("unspam")}
                disabled={disabled || picked.size === 0}
                className="px-2.5 py-1 rounded border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-slate-200"
              >
                스팸 해제
              </button>
            )}
            <button
              type="button"
              onClick={() => run("delete")}
              disabled={disabled || picked.size === 0}
              className="px-2.5 py-1 rounded border border-slate-200 hover:bg-red-50 hover:border-red-300 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-slate-200"
            >
              삭제
            </button>
            <button
              type="button"
              onClick={() => run("markRead")}
              disabled={disabled || picked.size === 0}
              className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              읽음
            </button>
            <button
              type="button"
              onClick={() => run("markUnread")}
              disabled={disabled || picked.size === 0}
              className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              안읽음
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => run("restore")}
              disabled={disabled || picked.size === 0}
              className="px-2.5 py-1 rounded border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-slate-200"
            >
              복원
            </button>
            <button
              type="button"
              onClick={() => run("purge")}
              disabled={disabled || picked.size === 0}
              className="px-2.5 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              영구 삭제
            </button>
          </>
        )}

        <div className="h-5 w-px bg-slate-200" />

        {/* Tag controls */}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            list="inbox-tag-list"
            placeholder="태그"
            maxLength={40}
            className="w-28 px-2 py-1 text-xs border border-slate-200 rounded"
          />
          <datalist id="inbox-tag-list">
            {allTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => run("addTag", tagInput.trim())}
            disabled={disabled || picked.size === 0 || !tagInput.trim()}
            className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-xs"
          >
            태그 추가
          </button>
          <button
            type="button"
            onClick={() => run("removeTag", tagInput.trim())}
            disabled={disabled || picked.size === 0 || !tagInput.trim()}
            className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-xs"
          >
            제거
          </button>
        </div>

        <div className="h-5 w-px bg-slate-200" />

        <button
          type="button"
          onClick={() => run("reclassify")}
          disabled={disabled || picked.size === 0}
          className="px-2.5 py-1 rounded border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-40 disabled:hover:bg-white text-xs"
          title="선택한 메일을 다시 스팸 점수로 평가합니다"
        >
          스팸 재분류
        </button>
      </div>

      <div className="grid grid-cols-12 gap-4 bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="col-span-5 border-r border-slate-200 max-h-[70vh] overflow-auto">
          {emails.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              {view === "trash"
                ? "휴지통이 비어있습니다."
                : view === "spam"
                  ? "스팸이 없습니다."
                  : "수신된 이메일이 없습니다."}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {emails.map((e) => {
                const isPicked = picked.has(e.id);
                const isSelected = selected?.id === e.id;
                return (
                  <li
                    key={e.id}
                    className={`flex items-start ${
                      isSelected ? "bg-slate-100" : ""
                    } ${isPicked ? "bg-blue-50/40" : ""}`}
                  >
                    <label className="pl-3 pt-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isPicked}
                        onChange={() => toggle(e.id)}
                        className="rounded border-slate-300"
                      />
                    </label>
                    <Link
                      href={buildHref(e.id, view)}
                      className="flex-1 block px-3 py-3 hover:bg-slate-50/60"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className={`text-sm truncate ${
                            e.isRead
                              ? "text-slate-600 font-normal"
                              : "text-slate-800 font-medium"
                          }`}
                        >
                          {e.fromName || e.fromEmail}
                        </div>
                        <div className="text-xs text-slate-400 shrink-0">
                          {fmtDate(new Date(e.createdAt))}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        → {e.toEmail}
                      </div>
                      <div
                        className={`text-sm truncate mt-0.5 ${
                          e.isRead ? "text-slate-500" : "text-slate-700"
                        }`}
                      >
                        {e.subject || "(제목 없음)"}
                      </div>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {e.isSpam && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                            스팸
                          </span>
                        )}
                        {!e.isSpam && e.spamScore >= SUSPECT_THRESHOLD && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 cursor-help"
                            title={
                              e.spamReasons.length > 0
                                ? `점수 ${e.spamScore} — ${e.spamReasons.join(" · ")}`
                                : `점수 ${e.spamScore}`
                            }
                          >
                            ⚠ 스팸 의심 {e.spamScore}
                          </span>
                        )}
                        {e.deletedAt && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                            휴지통
                          </span>
                        )}
                        {!e.forwarded && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                            전달 실패
                          </span>
                        )}
                        {e.tags.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="col-span-7 p-6 max-h-[70vh] overflow-auto">
          {!selected ? (
            <div className="text-slate-400 text-sm">
              왼쪽에서 이메일을 선택하세요.
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">
                {selected.subject || "(제목 없음)"}
              </h2>
              <div className="text-sm text-slate-500 space-y-0.5 mb-4 pb-4 border-b border-slate-100">
                <div>
                  <span className="text-slate-400">From: </span>
                  {selected.fromName
                    ? `${selected.fromName} <${selected.fromEmail}>`
                    : selected.fromEmail}
                </div>
                <div>
                  <span className="text-slate-400">To: </span>
                  {selected.toEmail}
                </div>
                {selected.cc && (
                  <div>
                    <span className="text-slate-400">Cc: </span>
                    {selected.cc}
                  </div>
                )}
                <div>
                  <span className="text-slate-400">Date: </span>
                  {new Date(selected.createdAt).toLocaleString("ko-KR")}
                </div>
                {(selected.isSpam ||
                  selected.deletedAt ||
                  selected.tags.length > 0) && (
                  <div className="flex items-center gap-1 pt-1 flex-wrap">
                    {selected.isSpam && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                        스팸
                      </span>
                    )}
                    {selected.deletedAt && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                        휴지통
                      </span>
                    )}
                    {selected.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {(selected.isSpam ||
                selected.spamScore >= SUSPECT_THRESHOLD) &&
                selected.spamReasons.length > 0 && (
                  <div
                    className={`mb-4 rounded-md border px-3 py-2 ${
                      selected.isSpam
                        ? "bg-amber-50 border-amber-200 text-amber-900"
                        : "bg-orange-50 border-orange-200 text-orange-900"
                    }`}
                  >
                    <div className="text-sm font-semibold mb-1">
                      ⚠ {selected.isSpam ? "스팸으로 분류됨" : "스팸 의심"} —
                      점수 {selected.spamScore}
                    </div>
                    <ul className="text-xs space-y-0.5 list-disc list-inside">
                      {selected.spamReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                    <div className="text-[11px] opacity-70 mt-1">
                      본문의 링크는 클릭하지 마세요. 발신자 도메인을 확인하세요.
                    </div>
                  </div>
                )}
              {selected.html ? (
                <iframe
                  title="email body"
                  srcDoc={selected.html}
                  sandbox=""
                  className="w-full min-h-[400px] border-0"
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans">
                  {selected.text || "(본문 없음)"}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildHref(id: string, view: View): string {
  const params = new URLSearchParams();
  params.set("id", id);
  if (view !== "inbox") params.set("view", view);
  return `/admin/inbox?${params.toString()}`;
}

function fmtDate(d: Date): string {
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

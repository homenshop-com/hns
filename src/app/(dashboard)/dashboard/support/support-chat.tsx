"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Message {
  id: string;
  sender: "USER" | "ADMIN";
  body: string;
  createdAt: string;
}

const POLL_INTERVAL_MS = 5000;

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateKey(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export default function SupportChat({ userInitial }: { userInitial: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [composing, setComposing] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Track whether we are pinned to the bottom; if user scrolled up to
  // read older messages, don't yank them back when a new poll arrives.
  const pinnedRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/support/messages", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setMessages((prev) => {
        const next: Message[] = data.messages || [];
        // Avoid re-rendering if nothing changed (same length + same last id).
        if (
          prev.length === next.length &&
          prev[prev.length - 1]?.id === next[next.length - 1]?.id
        ) {
          return prev;
        }
        return next;
      });
      setLoaded(true);
    } catch {
      // Network blip — polling will retry.
    }
  }, []);

  // Initial fetch + poll loop.
  useEffect(() => {
    fetchMessages();
    const t = setInterval(fetchMessages, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchMessages]);

  // Auto-scroll when messages change AND user was pinned to bottom.
  useEffect(() => {
    if (pinnedRef.current) scrollToBottom();
  }, [messages, scrollToBottom]);

  // Track whether user has scrolled up (within 80px of bottom = still pinned).
  function onScroll() {
    const el = bodyRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.clientHeight - el.scrollTop;
    pinnedRef.current = gap < 80;
  }

  function autoResize() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }

  async function send() {
    const text = composing.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "메시지 전송에 실패했습니다.");
      setComposing("");
      pinnedRef.current = true;
      // Optimistically append + refetch to pull real id from server.
      setMessages((prev) => [
        ...prev,
        {
          id: data.message.id,
          sender: "USER",
          body: data.message.body,
          createdAt: data.message.createdAt,
        },
      ]);
      // Reset height after clear
      setTimeout(autoResize, 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter = send, Shift+Enter = newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Group by day for date separators.
  const groups: Array<{ dateKey: string; items: Message[] }> = [];
  let current: { dateKey: string; items: Message[] } | null = null;
  for (const m of messages) {
    const k = dateKey(m.createdAt);
    if (!current || current.dateKey !== k) {
      current = { dateKey: k, items: [] };
      groups.push(current);
    }
    current.items.push(m);
  }

  return (
    <div className="sp2-card">
      <div className="sp2-head">
        <div className="admin-avatar">H</div>
        <div>
          <div className="nm">homeNshop 지원팀</div>
          <div className="sub">평일 09–18시 · 보통 1시간 내 응답</div>
        </div>
      </div>

      <div className="sp2-body" ref={bodyRef} onScroll={onScroll}>
        {loaded && messages.length === 0 ? (
          <div className="sp2-empty">
            <div className="ic">
              <svg width={26} height={26}><use href="#i-chat" /></svg>
            </div>
            <div className="t">무엇을 도와드릴까요?</div>
            <div className="s">
              사이트 설정·결제·도메인·크레딧 관련 문의를 아래 입력창에 남겨주세요.
              보통 평일 업무시간 내 답변드립니다.
            </div>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.dateKey}>
              <div className="sp2-date-sep">{g.dateKey}</div>
              {g.items.map((m) => (
                <div
                  key={m.id}
                  className={`sp2-msg ${m.sender === "USER" ? "mine" : "admin"}`}
                >
                  <div className="avatar">
                    {m.sender === "USER" ? userInitial : "H"}
                  </div>
                  <div>
                    <div className="bubble">{m.body}</div>
                    <div className="meta">{timeLabel(m.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {error && <div className="sp2-err">⚠️ {error}</div>}

      <div className="sp2-composer">
        <textarea
          ref={textareaRef}
          value={composing}
          onChange={(e) => {
            setComposing(e.target.value);
            autoResize();
          }}
          onKeyDown={onKeyDown}
          placeholder="메시지를 입력하세요 (Enter 전송 · Shift+Enter 줄바꿈)"
          maxLength={4000}
        />
        <button type="button" onClick={send} disabled={sending || !composing.trim()}>
          {sending ? "전송 중…" : "전송"}
        </button>
      </div>
    </div>
  );
}

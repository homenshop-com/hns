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

export default function AdminChat({
  userId,
  userInitial,
  userName,
  userEmail,
}: {
  userId: string;
  userInitial: string;
  userName: string;
  userEmail: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [composing, setComposing] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pinnedRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/support/${userId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setMessages((prev) => {
        const next: Message[] = data.messages || [];
        if (
          prev.length === next.length &&
          prev[prev.length - 1]?.id === next[next.length - 1]?.id
        ) {
          return prev;
        }
        return next;
      });
      setLoaded(true);
    } catch {}
  }, [userId]);

  useEffect(() => {
    fetchMessages();
    const t = setInterval(fetchMessages, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchMessages]);

  useEffect(() => {
    if (pinnedRef.current) scrollToBottom();
  }, [messages, scrollToBottom]);

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
      const res = await fetch(`/api/admin/support/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "메시지 전송에 실패했습니다.");
      setComposing("");
      pinnedRef.current = true;
      setMessages((prev) => [
        ...prev,
        {
          id: data.message.id,
          sender: "ADMIN",
          body: data.message.body,
          createdAt: data.message.createdAt,
        },
      ]);
      setTimeout(autoResize, 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

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
    <div className="sp2-card" style={{ maxWidth: 800 }}>
      <div className="sp2-head">
        <div className="admin-avatar">{userInitial}</div>
        <div>
          <div className="nm">{userName}</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{userEmail}</div>
        </div>
      </div>

      <div className="sp2-body" ref={bodyRef} onScroll={onScroll}>
        {loaded && messages.length === 0 ? (
          <div className="sp2-empty">
            <div className="ic">
              <svg width={26} height={26}><use href="#i-chat" /></svg>
            </div>
            <div className="t">아직 메시지가 없습니다</div>
            <div className="s">
              아래에서 고객에게 먼저 메시지를 보낼 수 있습니다.
            </div>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.dateKey}>
              <div className="sp2-date-sep">{g.dateKey}</div>
              {g.items.map((m) => (
                <div
                  key={m.id}
                  className={`sp2-msg ${m.sender === "ADMIN" ? "mine" : "admin"}`}
                >
                  <div className="avatar">
                    {m.sender === "ADMIN" ? "H" : userInitial}
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
          placeholder="답변을 입력하세요 (Enter 전송 · Shift+Enter 줄바꿈)"
          maxLength={4000}
        />
        <button type="button" onClick={send} disabled={sending || !composing.trim()}>
          {sending ? "전송 중…" : "전송"}
        </button>
      </div>
    </div>
  );
}

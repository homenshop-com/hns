"use client";

import { useState } from "react";

interface SettingKey {
  key: string;
  label: string;
  description: string;
}

export default function SettingsForm({
  settingKeys,
  currentValues,
}: {
  settingKeys: SettingKey[];
  currentValues: Record<string, string>;
}) {
  const [values, setValues] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const s of settingKeys) {
      init[s.key] = currentValues[s.key] === "true";
    }
    return init;
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function handleToggle(key: string, enabled: boolean) {
    setValues((prev) => ({ ...prev, [key]: enabled }));
    setSaving(key);
    setSaved(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: enabled ? "true" : "false" }),
      });
      if (res.ok) {
        setSaved(key);
        setTimeout(() => setSaved(null), 2000);
      }
    } catch {
      // revert
      setValues((prev) => ({ ...prev, [key]: !enabled }));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      {settingKeys.map((s) => (
        <div
          key={s.key}
          className="rounded-xl border border-slate-700/30 bg-[#1e293b]/80 p-5 flex items-center justify-between"
        >
          <div>
            <div className="text-sm font-semibold text-slate-200">{s.label}</div>
            <div className="text-xs text-slate-500 mt-1">{s.description}</div>
          </div>
          <div className="flex items-center gap-3">
            {saved === s.key && (
              <span className="text-xs text-emerald-400">저장됨</span>
            )}
            <button
              onClick={() => handleToggle(s.key, !values[s.key])}
              disabled={saving === s.key}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                values[s.key] ? "bg-cyan-500" : "bg-slate-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  values[s.key] ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className={`text-xs font-medium ${values[s.key] ? "text-cyan-400" : "text-slate-500"}`}>
              {values[s.key] ? "ON" : "OFF"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

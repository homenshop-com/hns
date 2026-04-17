import { prisma } from "@/lib/db";
import SettingsForm from "./settings-form";

const SETTING_KEYS = [
  {
    key: "emailVerificationEnabled",
    label: "이메일 인증",
    description: "회원가입 후 이메일 인증 요구 (템플릿 선택 시 인증 필요, 대시보드에 인증 안내 배너 표시)",
  },
];

export default async function AdminSettingsPage() {
  const rows = await prisma.systemSetting.findMany();
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 mb-6">시스템 설정</h1>
      <SettingsForm
        settingKeys={SETTING_KEYS}
        currentValues={settings}
      />
    </div>
  );
}

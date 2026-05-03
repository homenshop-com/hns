import { prisma } from "@/lib/db";
import NewProspectForm from "./form";

export default async function NewProspectPage() {
  // Pull the active templates list once on the server. The form lets the
  // admin pick one (or none — empty site). We deliberately keep this
  // small (id/name/thumb only) since most templates won't be used.
  const templates = await prisma.template.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      thumbnailUrl: true,
    },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">잠재고객 등록</h1>
        <p className="mt-1 text-sm text-slate-500">
          핸드폰 번호를 키로 사이트를 미리 만들어 두면, 고객이 동일 번호로 회원가입할 때 자동으로 인계됩니다.
        </p>
      </div>

      <NewProspectForm templates={templates} />
    </div>
  );
}

import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import InboxClient, {
  type InboxRow,
  type SelectedEmail,
} from "./inbox-client";

export const dynamic = "force-dynamic";

type View = "inbox" | "spam" | "trash" | "all";

function parseView(v: string | undefined): View {
  if (v === "spam" || v === "trash" || v === "all") return v;
  return "inbox";
}

function whereForView(view: View): Prisma.InboundEmailWhereInput {
  switch (view) {
    case "spam":
      return { isSpam: true, deletedAt: null };
    case "trash":
      return { deletedAt: { not: null } };
    case "all":
      return {};
    case "inbox":
    default:
      return { isSpam: false, deletedAt: null };
  }
}

async function markRead(id: string) {
  await prisma.inboundEmail
    .update({ where: { id }, data: { isRead: true } })
    .catch(() => null);
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; view?: string }>;
}) {
  const { id, view: viewParam } = await searchParams;
  const view = parseView(viewParam);

  const [rows, selectedRaw, counts, tagAgg] = await Promise.all([
    prisma.inboundEmail.findMany({
      where: whereForView(view),
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        fromEmail: true,
        fromName: true,
        toEmail: true,
        subject: true,
        forwarded: true,
        isSpam: true,
        isRead: true,
        tags: true,
        deletedAt: true,
        createdAt: true,
      },
    }),
    id ? prisma.inboundEmail.findUnique({ where: { id } }) : null,
    Promise.all([
      prisma.inboundEmail.count({ where: whereForView("inbox") }),
      prisma.inboundEmail.count({ where: whereForView("spam") }),
      prisma.inboundEmail.count({ where: whereForView("trash") }),
      prisma.inboundEmail.count({ where: whereForView("all") }),
    ]),
    prisma.inboundEmail.findMany({
      where: { tags: { isEmpty: false } },
      select: { tags: true },
      take: 500,
    }),
  ]);

  if (selectedRaw && !selectedRaw.isRead) {
    await markRead(selectedRaw.id);
  }

  const emails: InboxRow[] = rows.map((r) => ({
    id: r.id,
    fromEmail: r.fromEmail,
    fromName: r.fromName,
    toEmail: r.toEmail,
    subject: r.subject,
    forwarded: r.forwarded,
    isSpam: r.isSpam,
    isRead: r.isRead,
    tags: r.tags,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));

  const selected: SelectedEmail | null = selectedRaw
    ? {
        id: selectedRaw.id,
        subject: selectedRaw.subject,
        fromEmail: selectedRaw.fromEmail,
        fromName: selectedRaw.fromName,
        toEmail: selectedRaw.toEmail,
        cc: selectedRaw.cc,
        text: selectedRaw.text,
        html: selectedRaw.html,
        isSpam: selectedRaw.isSpam,
        tags: selectedRaw.tags,
        deletedAt: selectedRaw.deletedAt
          ? selectedRaw.deletedAt.toISOString()
          : null,
        createdAt: selectedRaw.createdAt.toISOString(),
      }
    : null;

  const allTags = Array.from(
    new Set(tagAgg.flatMap((r) => r.tags))
  ).sort();

  return (
    <InboxClient
      emails={emails}
      selected={selected}
      view={view}
      counts={{
        inbox: counts[0],
        spam: counts[1],
        trash: counts[2],
        all: counts[3],
      }}
      allTags={allTags}
    />
  );
}

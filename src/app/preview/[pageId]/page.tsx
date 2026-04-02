import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";

interface PreviewPageProps {
  params: Promise<{ pageId: string }>;
}

export default async function PreviewPage({ params }: PreviewPageProps) {
  const { pageId } = await params;

  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { site: true },
  });

  if (!page) notFound();

  const content = page.content as {
    html?: string;
    components?: object[];
  } | null;

  const html = content?.html || "";
  const css = page.css || "";

  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>
          {page.title} - {page.site.name}
        </title>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <style
          dangerouslySetInnerHTML={{
            __html: `
            body { margin: 0; padding: 0; font-family: 'Noto Sans KR', sans-serif; }
            * { box-sizing: border-box; }
          `,
          }}
        />
      </head>
      <body dangerouslySetInnerHTML={{ __html: html }} />
    </html>
  );
}

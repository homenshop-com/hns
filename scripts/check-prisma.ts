import { PrismaClient } from '../src/generated/prisma';
const p = new PrismaClient();
async function main() {
  const xunion5 = await p.site.findUnique({
    where: { shopId: 'xunion5' },
    include: { pages: { select: { slug: true, title: true, isHome: true, sortOrder: true } } }
  });
  console.log('xunion5:', JSON.stringify(xunion5, null, 2));
  const newkorea = await p.site.findUnique({ where: { shopId: 'newkorea' } });
  console.log('newkorea exists:', JSON.stringify(newkorea));
}
main().catch(console.error).finally(() => p[Symbol.asyncDispose as unknown as symbol] ? undefined : p['_disconnect'] ? undefined : undefined);

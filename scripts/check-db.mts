import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

const xunion5 = await prisma.site.findUnique({
  where: { shopId: 'xunion5' },
  include: { pages: { select: { slug: true, title: true, isHome: true, sortOrder: true } } }
});
console.log('xunion5:', JSON.stringify(xunion5, null, 2));

const newkorea = await prisma.site.findUnique({ where: { shopId: 'newkorea' } });
console.log('newkorea exists:', JSON.stringify(newkorea));

await prisma["$disconnect"]();

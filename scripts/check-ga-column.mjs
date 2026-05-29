import { PrismaClient } from "../src/generated/prisma/index.js";
const p = new PrismaClient();
const rows = await p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'Site' AND column_name LIKE 'googleAnalytics%' ORDER BY column_name`;
console.log(rows);
await p.$disconnect();

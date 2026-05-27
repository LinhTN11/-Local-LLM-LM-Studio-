import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const rawUrl = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  const dbPath = rawUrl.replace(/^file:/, '');
  const absolutePath = path.isAbsolute(dbPath)
    ? dbPath
    : path.join(process.cwd(), dbPath);

  const adapter = new PrismaBetterSqlite3({ url: absolutePath });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

let warmingTriggered = false;

async function triggerWarmUp() {
  if (warmingTriggered) return;
  warmingTriggered = true;
  try {
    const { warmUpGlobalCache } = await import('./cache-warmer');
    await warmUpGlobalCache();
  } catch (err) {
    console.error('[PrismaInit] Cache warming skipped:', (err as Error).message);
  }
}

if (typeof process !== 'undefined' && process.env.NEXT_RUNTIME !== 'edge') {
  if (!warmingTriggered) {
    triggerWarmUp();
  }
}

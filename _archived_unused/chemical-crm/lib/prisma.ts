import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// DATABASE_URL에 pool_timeout / connection_limit 파라미터가 없으면 Supabase 환경에서
// 대량 write 도중 "Timed out fetching a new connection" 오류가 발생함.
// 아래에서 URL에 파라미터를 보정한다 (이미 포함된 경우 중복 적용하지 않음).
function buildDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? "";
  const url = new URL(base);
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "3");
  if (!url.searchParams.has("pool_timeout"))     url.searchParams.set("pool_timeout",     "30");
  return url.toString();
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: { db: { url: buildDatabaseUrl() } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

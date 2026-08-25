import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

// Cache across module re-evaluations in *every* environment, not just dev.
// This previously only ran outside production, so each serverless cold
// start created a brand-new, unpooled `Pool` (default max 10 connections)
// with nothing capping how many concurrent Fluid Compute instances could
// do the same — that exhausted Prisma Postgres's connection limit and
// surfaced as "Failed to connect to upstream database" / 503s. A small
// max keeps each instance's footprint low regardless of environment.
const pool =
  globalForPrisma.pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const adapter = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

globalForPrisma.prisma = prisma;
globalForPrisma.pgPool = pool;

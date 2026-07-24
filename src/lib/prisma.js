import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis;

const configuredPoolMax = Number.parseInt(process.env.DATABASE_POOL_MAX || "", 10);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(Number.isInteger(configuredPoolMax) && configuredPoolMax > 0 ? { max: configuredPoolMax } : {}),
});
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

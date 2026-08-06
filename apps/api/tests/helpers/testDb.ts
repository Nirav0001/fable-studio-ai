// Ephemeral SQLite test harness (plan amendment A9 / ED7).
//
// Route-level tests need a real database behind supertest. Each test FILE
// gets its own throwaway SQLite db + storage dir under the OS temp dir:
// setupTestDb() points DATABASE_URL/STORAGE_DIR there and applies the Prisma
// schema with `prisma db push`.
//
// IMPORTANT: call setupTestDb() BEFORE anything imports src/config/env or
// src/lib/prisma (both read the environment at import time) — i.e. inside
// beforeAll, with the app/prisma pulled in via dynamic import() afterwards.

import { execSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TestDbHarness {
  /** Temp root holding the db file and the storage dir. */
  dir: string;
  /** Delete the temp root (call from afterAll, after prisma.$disconnect()). */
  cleanup(): Promise<void>;
}

function findSchema(): string {
  // vitest runs with cwd = apps/api (npm -w) — but tolerate a repo-root cwd.
  const candidates = [
    join(process.cwd(), "prisma", "schema.prisma"),
    join(process.cwd(), "apps", "api", "prisma", "schema.prisma"),
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  throw new Error(`testDb: could not locate schema.prisma from cwd ${process.cwd()}`);
}

export function setupTestDb(): TestDbHarness {
  const dir = mkdtempSync(join(tmpdir(), "fable-api-test-"));
  const dbUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;

  // Set BEFORE src/config/env loads: dotenv never overrides existing vars,
  // so these values win over apps/api/.env.
  process.env.DATABASE_URL = dbUrl;
  process.env.STORAGE_DIR = join(dir, "storage");
  process.env.AUTH_DEV_BYPASS = "false"; // 401 tests must not hit the demo-user bypass
  process.env.NODE_ENV = "test";
  process.env.REDIS_URL = ""; // memory queue driver

  execSync(`npx prisma db push --skip-generate --schema "${findSchema()}"`, {
    env: { ...process.env },
    stdio: "pipe",
  });

  return {
    dir,
    async cleanup() {
      await rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
    },
  };
}

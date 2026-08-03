/**
 * Swaps the Prisma datasource provider between sqlite (dev default) and
 * postgresql (production). Usage:
 *   npm run db:use:postgres            → postgres
 *   npm run db:use:postgres -- sqlite  → back to sqlite
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const target = process.argv[2] === "sqlite" ? "sqlite" : "postgresql";
const schemaPath = join(__dirname, "..", "prisma", "schema.prisma");
const schema = readFileSync(schemaPath, "utf8");
const next = schema.replace(/provider = "(sqlite|postgresql)"/, `provider = "${target}"`);
writeFileSync(schemaPath, next);
console.log(`Prisma datasource provider set to ${target}.`);
if (target === "postgresql") {
  console.log('Set DATABASE_URL=postgresql://fable:fable@localhost:5433/fable_studio in apps/api/.env');
  console.log("then run: docker compose up -d && npm run db:push && npm run db:seed");
}

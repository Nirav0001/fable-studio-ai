import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { assertProductionConfig } from "./lib/security";
import { startWorkers } from "./queue/workers";

async function main() {
  // Fail closed on insecure production config (JWT secret, dev bypass, DB).
  assertProductionConfig();
  const app = createApp();
  app.listen(env.port, () => {
    logger.info(`Fable Studio API listening on http://localhost:${env.port}`);
  });
  await startWorkers();
  logger.info("Background workers started");
}

main().catch((err) => {
  logger.error("Fatal startup error", err instanceof Error ? err.stack : err);
  process.exit(1);
});

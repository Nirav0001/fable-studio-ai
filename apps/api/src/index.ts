import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { assertProductionConfig } from "./lib/security";
import { startWorkers } from "./queue/workers";

async function main() {
  // Fail closed on insecure production config (JWT secret, dev bypass, DB).
  assertProductionConfig();
  // One-time cleanup: channels "connected" through the old dev mock path must
  // never masquerade as connected in production — reset them so the UI asks
  // for a real Google OAuth connection instead.
  if (env.isProd) {
    try {
      const reset = await prisma.channel.updateMany({
        where: { connected: true, youtubeJson: { contains: '"mock":true' } },
        data: { connected: false, youtubeJson: "{}" },
      });
      if (reset.count > 0) logger.info(`Reset ${reset.count} mock-connected channel(s)`);
    } catch (err) {
      logger.warn(
        `Mock-connection cleanup skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
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

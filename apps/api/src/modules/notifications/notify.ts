import { env } from "../../config/env";
import { createLogger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";

const log = createLogger("notify");

/**
 * Create an in-app notification for a user and (fire-and-forget) mirror it to
 * a Discord webhook when one is configured. Never throws — queue processors
 * call this from inside job pipelines and a notification failure must never
 * fail the job itself.
 */
export async function notify(
  userId: string,
  kind: string,
  title: string,
  body = "",
): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId, kind, title, body },
    });
  } catch (err) {
    log.warn(`failed to persist notification "${title}"`, err instanceof Error ? err.message : err);
  }

  if (env.discordWebhookUrl) {
    // Fire-and-forget — never await, never surface failures to the caller.
    void fetch(env.discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Fable Studio",
        embeds: [
          {
            title,
            description: body || undefined,
            color: 0x8b5cf6,
            footer: { text: `Fable Studio · ${kind}` },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    }).catch((err: unknown) => {
      log.debug("discord webhook delivery failed", err instanceof Error ? err.message : err);
    });
  }
}

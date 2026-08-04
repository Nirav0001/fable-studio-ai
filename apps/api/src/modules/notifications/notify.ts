import { safeJson } from "@fable/shared";
import { env } from "../../config/env";
import { createLogger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";

const log = createLogger("notify");

/** Only genuine Discord webhook endpoints — never POST user data anywhere else. */
export function isDiscordWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "discord.com" || u.hostname === "discordapp.com") &&
      u.pathname.startsWith("/api/webhooks/")
    );
  } catch {
    return false;
  }
}

/**
 * Create an in-app notification for a user and (fire-and-forget) mirror it to
 * their Discord webhook when enabled in Settings → Notifications. The user's
 * own webhook URL wins; the server env webhook is the fallback. Never throws —
 * queue processors call this from inside job pipelines and a notification
 * failure must never fail the job itself.
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

  let prefs: Record<string, unknown> = {};
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferencesJson: true },
    });
    prefs = safeJson<Record<string, unknown>>(user?.preferencesJson ?? "{}", {});
  } catch {
    /* prefs unavailable — no Discord mirror */
  }

  if (prefs.discordEnabled !== true) return;
  const userUrl = typeof prefs.discordWebhookUrl === "string" ? prefs.discordWebhookUrl : "";
  const webhookUrl = isDiscordWebhookUrl(userUrl) ? userUrl : env.discordWebhookUrl;
  if (!webhookUrl || !isDiscordWebhookUrl(webhookUrl)) return;

  // Fire-and-forget — never await, never surface failures to the caller.
  void fetch(webhookUrl, {
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

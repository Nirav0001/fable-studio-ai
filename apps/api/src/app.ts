import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { join } from "node:path";
import { env } from "./config/env";
import { hasFfmpeg, hasYtdlp, resolveAiProvider } from "./lib/capabilities";
import { prisma } from "./lib/prisma";
import { ok, handler } from "./lib/respond";
import { requireAuth } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimit";

// Module routers — each module owns its own routes/services/validation.
import authRouter from "./modules/auth/auth.routes";
import externalRouter from "./modules/external/external.routes";
import channelsRouter from "./modules/channels/channels.routes";
import oauthRouter from "./modules/channels/oauth.routes";
import projectsRouter from "./modules/projects/projects.routes";
import aiRouter from "./modules/ai/ai.routes";
import videosRouter from "./modules/videos/videos.routes";
import scheduleRouter from "./modules/schedule/schedule.routes";
import analyticsRouter from "./modules/analytics/analytics.routes";
import assetsRouter from "./modules/assets/assets.routes";
import templatesRouter from "./modules/templates/templates.routes";
import notificationsRouter from "./modules/notifications/notifications.routes";
import billingRouter from "./modules/billing/billing.routes";
import settingsRouter from "./modules/settings/settings.routes";
import jobsRouter from "./modules/jobs/jobs.routes";
import studioRouter from "./modules/studio/studio.routes";
import automationRouter from "./modules/automation/automation.routes";
import { getQueueDriverName } from "./queue/queue";

export function createApp() {
  const app = express();

  // Behind Railway's proxy — trust the first hop so express-rate-limit keys on
  // the real client IP instead of collapsing every user into one bucket.
  app.set("trust proxy", 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: [env.appUrl, "http://localhost:3100", "http://localhost:3000"],
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  // Stripe webhook needs the raw body — mounted before json parsing.
  app.use("/api/v1/webhooks/stripe", express.raw({ type: "application/json" }));
  app.use(express.json({ limit: "10mb" }));
  app.use("/api/v1", apiLimiter);

  // Rendered videos / thumbnails / uploaded assets served statically.
  // Harden: never let the browser sniff/execute a stored file (SVG/HTML XSS),
  // and force user-uploaded assets to download rather than render inline.
  app.use(
    "/files",
    (req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      if (req.path.startsWith("/uploads/")) {
        res.setHeader("Content-Disposition", "attachment");
      }
      next();
    },
    express.static(join(env.storageDir), { dotfiles: "deny", index: false }),
  );

  app.get(
    "/api/v1/health",
    handler(async (_req, res) => {
      let db = true;
      try {
        await prisma.user.count();
      } catch {
        db = false;
      }
      ok(res, {
        ok: db,
        version: "1.0.0",
        db,
        queueDriver: getQueueDriverName(),
        ffmpeg: await hasFfmpeg(),
        ytdlp: await hasYtdlp(),
        aiProvider: resolveAiProvider(),
        providers: {
          openai: Boolean(env.openaiKey),
          anthropic: Boolean(env.anthropicKey),
          gemini: Boolean(env.geminiKey),
          elevenlabs: Boolean(env.elevenlabsKey),
        },
        youtube: Boolean(env.ytClientId && env.ytClientSecret),
        stripe: Boolean(env.stripeSecretKey),
        storage: env.r2.accessKeyId ? "r2" : "local",
      });
    }),
  );

  const v1 = express.Router();
  v1.use("/auth", authRouter);
  v1.use("/oauth", oauthRouter);
  // External ingest authenticates with per-user API keys (Bearer), not the
  // session cookie — it MUST mount before requireAuth (amendment A9/ED6).
  // The global apiLimiter above still covers it.
  v1.use("/external", externalRouter);
  // Everything below requires a session (or dev bypass).
  v1.use(requireAuth);
  v1.use("/channels", channelsRouter);
  v1.use("/projects", projectsRouter);
  v1.use("/ai", aiRouter);
  v1.use("/videos", videosRouter);
  v1.use("/schedule", scheduleRouter);
  v1.use("/analytics", analyticsRouter);
  v1.use("/assets", assetsRouter);
  v1.use("/templates", templatesRouter);
  v1.use("/notifications", notificationsRouter);
  v1.use("/billing", billingRouter);
  v1.use("/settings", settingsRouter);
  v1.use("/jobs", jobsRouter);
  v1.use("/studio", studioRouter);
  v1.use("/automation", automationRouter);
  app.use("/api/v1", v1);

  app.use(errorHandler);
  return app;
}

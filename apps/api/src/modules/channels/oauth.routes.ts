import { Router } from "express";
import { env } from "../../config/env";
import { createLogger } from "../../lib/logger";
import { handler } from "../../lib/respond";
import { completeOAuthCallback } from "./channels.service";
import { verifyOAuthState } from "../../services/youtube";

const log = createLogger("oauth");

// Mounted WITHOUT requireAuth — Google's browser redirect lands here, so the
// route is identified purely by the state parameter (the channel id we sent).
const router = Router();

router.get(
  "/youtube/callback",
  handler(async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const oauthError = typeof req.query.error === "string" ? req.query.error : "";

    const parsed = state ? verifyOAuthState(state) : null;
    if (!parsed || oauthError) {
      const suffix = oauthError ? `&error=${encodeURIComponent(oauthError)}` : "";
      res.redirect(302, `${env.appUrl}/channels?connected=0${suffix}`);
      return;
    }

    try {
      await completeOAuthCallback(parsed.channelId, code, parsed.userId);
      res.redirect(302, `${env.appUrl}/channels?connected=1`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`YouTube OAuth callback failed for channel ${parsed.channelId}: ${message}`);
      res.redirect(302, `${env.appUrl}/channels?connected=0`);
    }
  }),
);

export default router;

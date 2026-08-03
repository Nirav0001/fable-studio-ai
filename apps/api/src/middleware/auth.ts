import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { unauthorized } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { runAsUser } from "../lib/providerKeys";
import { DEMO_USER } from "@fable/shared";

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  plan: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export const SESSION_COOKIE = "fable_session";

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: "7d" });
}

let demoUserCache: AuthedUser | null = null;

/**
 * Attaches req.user from the session cookie. In dev (AUTH_DEV_BYPASS=true) an
 * unauthenticated request falls back to the seeded demo user so the product is
 * explorable with zero setup — real login still works and takes precedence.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) {
      try {
        const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
        const user = await prisma.user.findUnique({ where: { id: payload.sub } });
        if (user) {
          req.user = { id: user.id, email: user.email, name: user.name, plan: user.plan };
          // Run the rest of the request inside the user's provider-key context
          // so AI/TTS/YouTube call sites resolve their keys automatically.
          return runAsUser(user.id, async () => next());
        }
      } catch {
        // fall through to bypass / 401
      }
    }
    if (env.authDevBypass && !env.isProd) {
      if (!demoUserCache) {
        const demo = await prisma.user.findUnique({ where: { email: DEMO_USER.email } });
        if (demo) demoUserCache = { id: demo.id, email: demo.email, name: demo.name, plan: demo.plan };
      }
      if (demoUserCache) {
        req.user = demoUserCache;
        return runAsUser(demoUserCache.id, async () => next());
      }
    }
    next(unauthorized());
  } catch (err) {
    next(err);
  }
}

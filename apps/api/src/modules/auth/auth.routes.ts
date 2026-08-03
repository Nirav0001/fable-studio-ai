import { Router, type CookieOptions } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { handler, ok } from "../../lib/respond";
import { requireAuth, SESSION_COOKIE, signSession } from "../../middleware/auth";
import { authLimiter } from "../../middleware/rateLimit";
import { validateBody } from "../../middleware/validate";
import { getUserById, loginUser, registerUser } from "./auth.service";

const router = Router();

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.isProd,
  maxAge: SESSION_MAX_AGE_MS,
  path: "/",
};

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100),
  name: z.string().trim().min(1).max(80),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(100),
});

router.post(
  "/register",
  authLimiter,
  validateBody(registerSchema),
  handler(async (req, res) => {
    const body = req.body as z.infer<typeof registerSchema>;
    const user = await registerUser(body.email, body.password, body.name);
    res.cookie(SESSION_COOKIE, signSession(user.id), cookieOptions);
    ok(res, { user }, 201);
  }),
);

router.post(
  "/login",
  authLimiter,
  validateBody(loginSchema),
  handler(async (req, res) => {
    const body = req.body as z.infer<typeof loginSchema>;
    const user = await loginUser(body.email, body.password);
    res.cookie(SESSION_COOKIE, signSession(user.id), cookieOptions);
    ok(res, { user });
  }),
);

router.post(
  "/logout",
  handler(async (_req, res) => {
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProd,
      path: "/",
    });
    ok(res, {});
  }),
);

router.get(
  "/me",
  requireAuth,
  handler(async (req, res) => {
    const user = await getUserById(req.user!.id);
    ok(res, { user });
  }),
);

export default router;

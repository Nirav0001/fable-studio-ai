import type { Response } from "express";

/** Success envelope — every endpoint responds { ok: true, data } */
export function ok<T>(res: Response, data: T, status = 200) {
  res.status(status).json({ ok: true, data });
}

/** Wrap an async route handler so thrown errors reach the error middleware. */
import type { NextFunction, Request, RequestHandler } from "express";
export function handler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

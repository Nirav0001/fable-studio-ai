import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

/** Validates and replaces req.body (or query) with the parsed value. */
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    (req as Request & { parsedQuery: unknown }).parsedQuery = result.data;
    next();
  };
}

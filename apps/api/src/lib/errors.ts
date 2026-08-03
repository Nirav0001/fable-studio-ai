export class AppError extends Error {
  constructor(
    message: string,
    public status = 500,
    public code = "INTERNAL_ERROR",
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Resource") => new AppError(`${what} not found`, 404, "NOT_FOUND");
export const badRequest = (message: string, details?: unknown) =>
  new AppError(message, 400, "BAD_REQUEST", details);
export const unauthorized = (message = "Not authenticated") =>
  new AppError(message, 401, "UNAUTHORIZED");
export const forbidden = (message = "Not allowed") => new AppError(message, 403, "FORBIDDEN");
export const conflict = (message: string) => new AppError(message, 409, "CONFLICT");

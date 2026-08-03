/** Minimal structured logger with levels + scopes; no external deps. */
type Level = "debug" | "info" | "warn" | "error";

const COLORS: Record<Level, string> = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};
const RESET = "\x1b[0m";

function write(level: Level, scope: string, message: string, meta?: unknown) {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `${COLORS[level]}${ts} ${level.toUpperCase().padEnd(5)} [${scope}]${RESET} ${message}`;
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (meta !== undefined) fn(line, typeof meta === "object" ? JSON.stringify(meta) : meta);
  else fn(line);
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, meta?: unknown) => write("debug", scope, msg, meta),
    info: (msg: string, meta?: unknown) => write("info", scope, msg, meta),
    warn: (msg: string, meta?: unknown) => write("warn", scope, msg, meta),
    error: (msg: string, meta?: unknown) => write("error", scope, msg, meta),
  };
}

export const logger = createLogger("api");

/**
 * Typed fetch client for the Fable Studio API.
 * Every endpoint responds with { ok: true, data } or { ok: false, error }.
 * Usage: const channels = await api.get<ChannelSummary[]>("/channels");
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = "UNKNOWN",
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const BASE = "/api/v1";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(`Invalid response (${res.status})`, res.status);
  }

  const envelope = json as {
    ok: boolean;
    data?: T;
    error?: { code: string; message: string; details?: unknown };
  };

  if (!res.ok || !envelope.ok) {
    const err = envelope.error;
    if (res.status === 401 && typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new ApiError(err?.message ?? `Request failed (${res.status})`, res.status, err?.code, err?.details);
  }
  return envelope.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

/** Multipart upload helper (assets). */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", credentials: "include", body: form });
  const json = (await res.json()) as { ok: boolean; data?: T; error?: { message: string; code: string } };
  if (!res.ok || !json.ok) {
    throw new ApiError(json.error?.message ?? "Upload failed", res.status, json.error?.code);
  }
  return json.data as T;
}

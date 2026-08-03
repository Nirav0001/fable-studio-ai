import { resolveAiProvider } from "../../lib/capabilities";
import { activeKeys } from "../../lib/providerKeys";
import { createLogger } from "../../lib/logger";

const log = createLogger("ai");

/**
 * Thrown when a completion is requested while the resolved provider is "mock".
 * Callers either check isMockAi() up-front or catch this and fall back to
 * their deterministic generator.
 */
export class MockRequested extends Error {
  constructor() {
    super("AI provider is 'mock' — use the deterministic generator instead");
    this.name = "MockRequested";
  }
}

export function isMockAi(): boolean {
  return resolveAiProvider() === "mock";
}

// ── Rough token accounting (chars / 4 both directions) ───────────────────────

let usedTokens = 0;

export function addUsage(tokens: number): void {
  if (Number.isFinite(tokens) && tokens > 0) usedTokens += Math.round(tokens);
}

/** Total estimated tokens consumed since process start — billing reads this. */
export function getUsage(): number {
  return usedTokens;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Completion ───────────────────────────────────────────────────────────────

export interface AiCompleteOptions {
  system?: string;
  prompt: string;
  /** Instructs the model to answer with pure JSON (no fences, no prose). */
  json?: boolean;
  maxTokens?: number;
}

const JSON_INSTRUCTION =
  "Respond with ONLY valid JSON. No markdown, no code fences, no commentary before or after.";

const FETCH_TIMEOUT_MS = 45_000;

export async function aiComplete(opts: AiCompleteOptions): Promise<string> {
  const provider = resolveAiProvider();
  if (provider === "mock") throw new MockRequested();

  const system = opts.json
    ? [opts.system, JSON_INSTRUCTION].filter(Boolean).join("\n\n")
    : opts.system;
  const maxTokens = opts.maxTokens ?? 1600;

  addUsage(estimateTokens(`${system ?? ""}${opts.prompt}`));

  let text: string;
  switch (provider) {
    case "openai":
      text = await completeOpenAi(system, opts.prompt, maxTokens, Boolean(opts.json));
      break;
    case "anthropic":
      text = await completeAnthropic(system, opts.prompt, maxTokens);
      break;
    case "gemini":
      text = await completeGemini(system, opts.prompt, maxTokens, Boolean(opts.json));
      break;
    default:
      throw new MockRequested();
  }

  addUsage(estimateTokens(text));
  return text;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AI request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json();
}

async function completeOpenAi(
  system: string | undefined,
  prompt: string,
  maxTokens: number,
  json: boolean,
): Promise<string> {
  const data = (await postJson(
    "https://api.openai.com/v1/chat/completions",
    { authorization: `Bearer ${activeKeys().openaiKey}` },
    {
      model: "gpt-4o-mini",
      max_tokens: maxTokens,
      temperature: 0.85,
      ...(json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
    },
  )) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty completion");
  return content;
}

async function completeAnthropic(
  system: string | undefined,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  const data = (await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": activeKeys().anthropicKey, "anthropic-version": "2023-06-01" },
    {
      model: "claude-sonnet-4-5",
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    },
  )) as { content?: { type: string; text?: string }[] };
  const text = data.content
    ?.filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  if (!text) throw new Error("Anthropic returned an empty completion");
  return text;
}

async function completeGemini(
  system: string | undefined,
  prompt: string,
  maxTokens: number,
  json: boolean,
): Promise<string> {
  // Key travels in a header, never the URL — query strings leak into proxy/
  // access logs; headers don't.
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  const data = (await postJson(url, { "x-goog-api-key": activeKeys().geminiKey }, {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.85,
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  })) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("Gemini returned an empty completion");
  return text;
}

// ── JSON mode helpers ────────────────────────────────────────────────────────

/** Strips ``` fences and leading/trailing prose around a JSON payload. */
export function stripJsonFences(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  return s;
}

/**
 * Parse model output as JSON with a repair fallback: extract the first
 * balanced-looking object/array substring and strip trailing commas.
 */
export function parseAiJson<T>(raw: string): T {
  const cleaned = stripJsonFences(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Repair: slice from the first { or [ to the last } or ] and drop trailing commas.
    const start = cleaned.search(/[[{]/);
    if (start === -1) throw new Error("AI response contained no JSON");
    const lastObj = cleaned.lastIndexOf("}");
    const lastArr = cleaned.lastIndexOf("]");
    const end = Math.max(lastObj, lastArr);
    if (end <= start) throw new Error("AI response contained malformed JSON");
    const sliced = cleaned
      .slice(start, end + 1)
      .replace(/,\s*([\]}])/g, "$1");
    return JSON.parse(sliced) as T;
  }
}

/** aiComplete in JSON mode + robust parse. */
export async function aiCompleteJson<T>(opts: Omit<AiCompleteOptions, "json">): Promise<T> {
  const raw = await aiComplete({ ...opts, json: true });
  try {
    return parseAiJson<T>(raw);
  } catch (err) {
    log.warn(`JSON parse failed: ${(err as Error).message}`);
    throw err;
  }
}

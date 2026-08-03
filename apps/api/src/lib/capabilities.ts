import { execFile } from "node:child_process";
import { env } from "../config/env";
import type { AiProviderName } from "@fable/shared";

function binaryExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(cmd, ["-version"], { timeout: 4000 }, (err) => resolve(!err));
  });
}

let ffmpegCache: boolean | null = null;
let ytdlpCache: boolean | null = null;

export async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegCache === null) ffmpegCache = await binaryExists(env.ffmpegPath);
  return ffmpegCache;
}

export async function hasYtdlp(): Promise<boolean> {
  if (ytdlpCache === null) {
    ytdlpCache = await new Promise<boolean>((resolve) => {
      execFile(env.ytdlpPath, ["--version"], { timeout: 4000 }, (err) => resolve(!err));
    });
  }
  return ytdlpCache === true;
}

export function resolveAiProvider(): AiProviderName {
  if (env.aiProvider !== "auto") return env.aiProvider;
  if (env.openaiKey) return "openai";
  if (env.anthropicKey) return "anthropic";
  if (env.geminiKey) return "gemini";
  return "mock";
}

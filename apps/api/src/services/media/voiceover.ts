import { execFile, spawn } from "node:child_process";
import { mkdir, stat, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { VoiceConfig } from "@fable/shared";
import { env } from "../../config/env";
import { createLogger } from "../../lib/logger";
import { activeKeys } from "../../lib/providerKeys";
import { addUsage } from "../ai";

const log = createLogger("voiceover");

export interface VoiceoverLine {
  atSec: number;
  text: string;
}

export interface VoiceTrack {
  path: string;
  atSec: number;
  /** Measured duration of the synthesized audio — drives script retiming. */
  durationSec: number;
}

/** ffprobe the real duration of a synthesized file (0 on failure). */
function probeDuration(path: string): Promise<number> {
  return new Promise((resolve) => {
    execFile(
      env.ffmpegPath.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1"),
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
      { timeout: 10_000 },
      (err, stdout) => resolve(err ? 0 : Number(String(stdout).trim()) || 0),
    );
  });
}

/**
 * Fully decode a synthesized file to prove it is playable.
 *
 * A truncated TTS response often keeps a VALID header — ffprobe reports a
 * duration from the bitrate, so a probe-only check passes — but decoding the
 * data blows up mid-render and takes the whole filter graph with it
 * ("Error while processing the decoded data for stream #N"). Decoding to null
 * is the only check that catches it, and voice clips are short so it's cheap.
 */
function decodesCleanly(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      env.ffmpegPath,
      ["-v", "error", "-xerror", "-i", path, "-f", "null", "-"],
      { timeout: 20_000 },
      (err, _stdout, stderr) => resolve(!err && String(stderr).trim().length === 0),
    );
  });
}

const DEFAULT_VOICE: VoiceConfig = {
  provider: "mock",
  voiceId: "onyx-uk",
  gender: "male",
  accent: "british",
  energy: "high",
  emotion: "excited",
};

/** Map our voice presets onto OpenAI TTS voice names. */
function openaiVoice(voice: VoiceConfig): string {
  const id = voice.voiceId.toLowerCase();
  for (const name of ["onyx", "nova", "echo", "alloy", "fable", "shimmer"]) {
    if (id.includes(name)) return name;
  }
  return voice.gender === "female" ? "nova" : "onyx";
}

async function synthOpenAi(line: string, voice: VoiceConfig, outPath: string): Promise<void> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      authorization: `Bearer ${activeKeys().openaiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: openaiVoice(voice),
      input: line,
      response_format: "wav",
      speed: voice.energy === "hyper" ? 1.15 : voice.energy === "calm" ? 0.95 : 1.05,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0, 160)}`);
  await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
  addUsage(Math.ceil(line.length / 4));
}

/** Premade voice ("George") — usable via API on the ElevenLabs free tier. */
const EL_FREE_TIER_VOICE = "JBFqnCBsd6RMkjVDRZzb";

async function elRequest(line: string, voiceId: string): Promise<Response> {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "xi-api-key": activeKeys().elevenlabsKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text: line,
      model_id: "eleven_turbo_v2_5",
      voice_settings: { stability: 0.4, similarity_boost: 0.7 },
    }),
    signal: AbortSignal.timeout(30_000),
  });
}

async function synthElevenLabs(line: string, voice: VoiceConfig, outPath: string): Promise<void> {
  const configured = /^[A-Za-z0-9]{16,}$/.test(voice.voiceId) ? voice.voiceId : EL_FREE_TIER_VOICE;
  let res = await elRequest(line, configured);
  // Plan-locked or missing voice → retry once with the free-tier-safe premade.
  if ((res.status === 402 || res.status === 404) && configured !== EL_FREE_TIER_VOICE) {
    log.warn(`ElevenLabs voice ${configured} unavailable (${res.status}) — retrying with premade voice`);
    res = await elRequest(line, EL_FREE_TIER_VOICE);
  }
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 160)}`);
  await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
}

/**
 * Offline fallback: Windows built-in SAPI voices via System.Speech.
 * One PowerShell process (spawned with -ExecutionPolicy Bypass, which scopes to
 * this process only) writes every line to its own WAV.
 */
async function synthSapiBatch(
  lines: VoiceoverLine[],
  voice: VoiceConfig,
  workDir: string,
): Promise<VoiceTrack[]> {
  const rate = { calm: -1, medium: 1, high: 2, hyper: 4 }[voice.energy] ?? 2;
  const gender = voice.gender === "female" ? "Female" : "Male";
  // Never interpolate user text into the PowerShell source — pass it as base64
  // and decode inside PS. This closes any quote-breakout / injection vector
  // (e.g. Unicode smart-quotes) regardless of what the text contains.
  const b64 = (s: string): string => Buffer.from(s, "utf16le").toString("base64");
  const decode = (v: string): string =>
    `[System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('${v}'))`;

  const body: string[] = [
    "Add-Type -AssemblyName System.Speech",
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    `$s.Rate = ${rate}`,
    `try { $s.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::${gender}, [System.Speech.Synthesis.VoiceAge]::Adult) } catch {}`,
  ];
  const tracks: VoiceTrack[] = [];
  lines.forEach((line, i) => {
    const wav = join(workDir, `vo-${i}.wav`);
    tracks.push({ path: wav, atSec: line.atSec, durationSec: 0 });
    body.push(`$s.SetOutputToWaveFile(${decode(b64(wav))})`);
    body.push(`$s.Speak(${decode(b64(line.text))})`);
  });
  body.push("$s.SetOutputToDefaultAudioDevice()", "$s.Dispose()");

  const scriptPath = join(workDir, "voiceover.ps1");
  await writeFile(scriptPath, body.join("\r\n"), "utf8");

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 90_000);
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`SAPI synthesis exited ${code}: ${stderr.slice(-300)}`));
    });
  });

  // Keep only tracks whose WAV actually materialized with content.
  const ok: VoiceTrack[] = [];
  for (const t of tracks) {
    try {
      const s = await stat(t.path);
      if (s.size > 200) ok.push(t);
    } catch {
      /* skip missing */
    }
  }
  if (ok.length === 0) throw new Error("SAPI produced no audio");
  return ok;
}

/**
 * Synthesize voiceover lines into per-line audio files.
 * Provider chain: OpenAI TTS → ElevenLabs → Windows SAPI (offline).
 * Returns null when every provider fails — the render then ships music-only.
 */
export async function synthesizeVoiceover(
  lines: VoiceoverLine[],
  voice: Partial<VoiceConfig> | undefined,
  workDir: string,
): Promise<VoiceTrack[] | null> {
  const usable = lines
    .filter((l) => l.text.trim().length > 0)
    .slice(0, 24)
    .map((l) => ({ atSec: Math.max(0, l.atSec), text: l.text.trim().slice(0, 300) }));
  if (usable.length === 0) return null;

  const v: VoiceConfig = { ...DEFAULT_VOICE, ...voice };
  await mkdir(workDir, { recursive: true });

  // ElevenLabs leads when configured — it's the premium voice product users
  // buy specifically for narration quality; OpenAI TTS is the cheaper backup.
  const providers: { name: string; enabled: boolean; run: () => Promise<VoiceTrack[]> }[] = [
    {
      name: "elevenlabs",
      enabled: Boolean(activeKeys().elevenlabsKey),
      run: async () => {
        const out: VoiceTrack[] = [];
        for (let i = 0; i < usable.length; i++) {
          const p = join(workDir, `vo-${i}.mp3`);
          await synthElevenLabs(usable[i].text, v, p);
          out.push({ path: p, atSec: usable[i].atSec, durationSec: 0 });
        }
        return out;
      },
    },
    {
      name: "openai",
      enabled: Boolean(activeKeys().openaiKey),
      run: async () => {
        const out: VoiceTrack[] = [];
        for (let i = 0; i < usable.length; i++) {
          const p = join(workDir, `vo-${i}.wav`);
          await synthOpenAi(usable[i].text, v, p);
          out.push({ path: p, atSec: usable[i].atSec, durationSec: 0 });
        }
        return out;
      },
    },
    {
      name: "sapi",
      enabled: process.platform === "win32",
      run: () => synthSapiBatch(usable, v, workDir),
    },
  ];

  for (const provider of providers) {
    if (!provider.enabled) continue;
    try {
      const tracks = await provider.run();
      // Probe AND decode-verify every file — a corrupt clip must never reach
      // the render's filter graph, where it kills the entire video.
      const checked = await Promise.all(
        tracks.map(async (t) => {
          t.durationSec = await probeDuration(t.path);
          const ok = t.durationSec > 0.1 && (await decodesCleanly(t.path));
          return { track: t, ok };
        }),
      );
      const good = checked.filter((c) => c.ok).map((c) => c.track);
      if (good.length === 0) {
        throw new Error(`${provider.name} produced no playable audio (${tracks.length} corrupt files)`);
      }
      if (good.length < tracks.length) {
        log.warn(
          `Voiceover: dropped ${tracks.length - good.length} corrupt file(s) from ${provider.name}`,
        );
      }
      log.info(`Voiceover: ${good.length}/${usable.length} lines via ${provider.name}`);
      return good;
    } catch (err) {
      log.warn(`Voiceover provider ${provider.name} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return null;
}

/** Best-effort cleanup of a voiceover work directory. */
export async function cleanupVoiceover(workDir: string): Promise<void> {
  await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
}

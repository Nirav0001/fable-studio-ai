import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../../config/env";
import { createLogger } from "../../lib/logger";

const log = createLogger("music");

/**
 * One-time peaceful music bed for WYR renders, generated through the
 * ElevenLabs sound-generation API and cached forever in storage/music.
 * Returns null when unavailable — the renderer then uses its synthesized pad.
 */
let bedPromise: Promise<string | null> | null = null;

export function ensureMusicBed(): Promise<string | null> {
  if (!bedPromise) {
    bedPromise = (async () => {
      const dir = join(env.storageDir, "music");
      const path = join(dir, "wyr-bed.mp3");
      try {
        const s = await stat(path);
        if (s.size > 10_000) return path;
      } catch {
        /* not cached yet */
      }
      if (!env.elevenlabsKey) return null;
      try {
        const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
          method: "POST",
          headers: { "xi-api-key": env.elevenlabsKey, "content-type": "application/json" },
          body: JSON.stringify({
            text: "soft peaceful ambient background music loop, warm gentle pads, calm and pleasant, light and airy, seamless loop, no percussion, no vocals",
            duration_seconds: 20,
            prompt_influence: 0.3,
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) throw new Error(`sound-generation ${res.status}: ${(await res.text()).slice(0, 140)}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.byteLength < 10_000) throw new Error("suspiciously small audio");
        await mkdir(dir, { recursive: true });
        await writeFile(path, buf);
        log.info(`Music bed generated and cached (${Math.round(buf.byteLength / 1024)}KB)`);
        return path;
      } catch (err) {
        log.warn(`Music bed unavailable — using synthesized pad: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    })();
  }
  return bedPromise;
}

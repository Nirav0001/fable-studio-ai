/**
 * Dev probe: confirms which voiceover provider the chain actually uses.
 * Synthesizes one short line into a temp dir and prints the provider log.
 *   npx tsx scripts/voice-probe.ts
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { synthesizeVoiceover, cleanupVoiceover } from "../src/services/media/voiceover";

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "fable-voice-probe-"));
  const tracks = await synthesizeVoiceover(
    [{ atSec: 0, text: "Would you rather test the voice, or ship it untested?" }],
    undefined,
    dir,
  );
  console.log(tracks ? `PROBE OK — ${tracks.length} track(s) synthesized` : "PROBE FAILED — no provider succeeded");
  await cleanupVoiceover(dir);
}

main().catch((err) => {
  console.error("probe error:", err instanceof Error ? err.message : err);
  process.exit(1);
});

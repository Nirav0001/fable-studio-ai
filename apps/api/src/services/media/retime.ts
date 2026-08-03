import type { ScriptPlan, SceneT } from "@fable/shared";
import type { VoiceTrack } from "./voiceover";

/**
 * Stretch scene timings so every voiceover line fits inside the window where
 * its content is on screen — the fix for narration lines talking over each
 * other when real TTS runs longer than the planned timer.
 *
 * A question's speech may bleed into its reveal (same question stays on
 * screen); hook and CTA lines must fit their own scene. Every extension
 * shifts all later scenes (and their voice lines) by the same delta.
 */
export function retimeScriptToVoice(
  script: ScriptPlan,
  tracks: VoiceTrack[],
): { script: ScriptPlan; tracks: VoiceTrack[] } {
  const BREATH = 0.35; // seconds of air after each line
  const scenes: SceneT[] = script.scenes.map((s) => ({ ...s }));
  const shifted: VoiceTrack[] = tracks.map((t) => ({ ...t }));

  // Match tracks to scenes by their ORIGINAL start times before any shifting.
  const trackByOriginalStart = new Map<number, VoiceTrack>();
  for (const t of shifted) trackByOriginalStart.set(Math.round(t.atSec * 100), t);

  let delta = 0;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const originalStart = scene.startSec;
    scene.startSec = Math.round((scene.startSec + delta) * 100) / 100;

    const track = trackByOriginalStart.get(Math.round(originalStart * 100));
    if (track) {
      track.atSec = scene.startSec;
      if (track.durationSec > 0) {
        // Reveal window extends a question's allowance — the pair shows the
        // same question continuously.
        const reveal = scene.kind === "question" && scenes[i + 1]?.kind === "reveal" ? scenes[i + 1] : undefined;
        const windowSec = scene.durationSec + (reveal?.durationSec ?? 0);
        const overrun = track.durationSec + BREATH - windowSec;
        if (overrun > 0) {
          scene.durationSec = Math.round((scene.durationSec + overrun) * 100) / 100;
          delta += overrun;
        }
      }
    }
  }

  const last = scenes[scenes.length - 1];
  const total = last ? Math.round((last.startSec + last.durationSec) * 10) / 10 : script.totalDurationSec;

  return {
    script: {
      ...script,
      scenes,
      totalDurationSec: total,
      voiceoverLines: script.voiceoverLines, // superseded by tracks' atSec for rendering
    },
    tracks: shifted,
  };
}

import type { LucideIcon } from "lucide-react";
import {
  Camera,
  Film,
  Image as ImageIcon,
  Mic,
  Music,
  Type,
  Video,
  Volume2,
} from "lucide-react";
import type { AssetKind } from "@fable/shared";

/** Asset row as returned by GET /assets (meta parsed, url resolved). */
export interface AssetT {
  id: string;
  kind: AssetKind;
  name: string;
  url: string | null;
  sizeBytes: number;
  durationSec: number | null;
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface AssetKindMeta {
  label: string;
  icon: LucideIcon;
  /** Text colour for the kind icon. */
  text: string;
  /** Background tint for the icon tile. */
  bg: string;
}

export const ASSET_KIND_META: Record<AssetKind, AssetKindMeta> = {
  music: { label: "Music", icon: Music, text: "text-violet-300", bg: "bg-violet-500/15" },
  gif: { label: "GIF", icon: Film, text: "text-pink-300", bg: "bg-pink-500/15" },
  logo: { label: "Logo", icon: ImageIcon, text: "text-sky-300", bg: "bg-sky-500/15" },
  font: { label: "Font", icon: Type, text: "text-amber-300", bg: "bg-amber-500/15" },
  voiceover: { label: "Voiceover", icon: Mic, text: "text-emerald-300", bg: "bg-emerald-500/15" },
  video: { label: "Video", icon: Video, text: "text-purple-300", bg: "bg-purple-500/15" },
  sfx: { label: "SFX", icon: Volume2, text: "text-fuchsia-300", bg: "bg-fuchsia-500/15" },
  thumbnail: { label: "Thumbnail", icon: Camera, text: "text-rose-300", bg: "bg-rose-500/15" },
};

/** Tab order for the assets page filter. */
export const ASSET_KINDS: AssetKind[] = [
  "music",
  "gif",
  "logo",
  "font",
  "voiceover",
  "video",
  "sfx",
  "thumbnail",
];

/** Kinds previewable with a native <audio> element. */
export const AUDIO_KINDS: AssetKind[] = ["music", "sfx", "voiceover"];

/** Kinds previewable with an <img> element. */
export const IMAGE_KINDS: AssetKind[] = ["gif", "logo", "thumbnail"];

/**
 * Infer the asset kind from a dropped file:
 * audio → music, gif → gif, other images → logo, video → video,
 * ttf/otf → font, everything else → video.
 */
export function inferKind(file: File): AssetKind {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "ttf" || ext === "otf") return "font";
  if (file.type === "image/gif" || ext === "gif") return "gif";
  if (file.type.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a", "flac", "aac"].includes(ext)) {
    return "music";
  }
  if (file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "svg"].includes(ext)) {
    return "logo";
  }
  if (file.type.startsWith("video/") || ["mp4", "mov", "webm", "mkv", "avi"].includes(ext)) {
    return "video";
  }
  return "video";
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

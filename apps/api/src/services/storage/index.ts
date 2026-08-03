import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../../config/env";
import { createLogger } from "../../lib/logger";

const log = createLogger("storage");

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".txt": "text/plain",
};

export function contentTypeFor(filename: string): string {
  return CONTENT_TYPES[extname(filename).toLowerCase()] ?? "application/octet-stream";
}

export function isR2Enabled(): boolean {
  return Boolean(env.r2.accountId && env.r2.accessKeyId && env.r2.secretAccessKey);
}

let s3Client: S3Client | null = null;

function getS3(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2.accessKeyId,
        secretAccessKey: env.r2.secretAccessKey,
      },
    });
  }
  return s3Client;
}

export function sanitizeFilename(filename: string): string {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "file";
}

/** Public URL for a stored file: R2 public URL when configured, else /files. */
export function publicUrl(subdir: string, filename: string): string {
  if (isR2Enabled() && env.r2.publicUrl) {
    return `${env.r2.publicUrl.replace(/\/+$/, "")}/${subdir}/${filename}`;
  }
  return `/files/${subdir}/${encodeURIComponent(filename)}`;
}

export interface SavedFile {
  /** Relative subpath under the storage dir, e.g. "uploads/logo.png" */
  filePath: string;
  /** Absolute path on disk */
  absolutePath: string;
  url: string;
  sizeBytes: number;
}

/**
 * Persist a file locally (always) and mirror it to R2 when keys are present.
 * `data` may be a Buffer or a path to an existing file to copy from.
 */
export async function saveFile(
  subdir: string,
  filename: string,
  data: Buffer | string,
): Promise<SavedFile> {
  const safeName = sanitizeFilename(filename);
  const dir = join(env.storageDir, subdir);
  await mkdir(dir, { recursive: true });
  const absolutePath = join(dir, safeName);

  let buffer: Buffer;
  if (typeof data === "string") {
    buffer = await readFile(data);
    await copyFile(data, absolutePath);
  } else {
    buffer = data;
    await writeFile(absolutePath, buffer);
  }

  if (isR2Enabled()) {
    try {
      await getS3().send(
        new PutObjectCommand({
          Bucket: env.r2.bucket,
          Key: `${subdir}/${safeName}`,
          Body: buffer,
          ContentType: contentTypeFor(safeName),
        }),
      );
      log.info(`Mirrored ${subdir}/${safeName} to R2 (${buffer.length} bytes)`);
    } catch (err) {
      // Local copy is authoritative — R2 mirroring is best-effort.
      log.warn(`R2 upload failed for ${subdir}/${safeName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    filePath: `${subdir}/${safeName}`,
    absolutePath,
    url: publicUrl(subdir, safeName),
    sizeBytes: buffer.length,
  };
}

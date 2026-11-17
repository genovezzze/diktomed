import "server-only";
import path from "node:path";
import { promises as fs } from "node:fs";

// Audio lives on the hospital server's (encrypted) disk, never in the database
// and never in a cloud bucket. Web and worker share this directory.

export function storageRoot(): string {
  return path.resolve(process.env.STORAGE_DIR ?? "./data");
}

/** Resolves a recording's directory and refuses anything that escapes the root. */
export function recordingDir(storageKey: string): string {
  const root = storageRoot();
  const dir = path.resolve(root, storageKey);
  if (dir !== root && !dir.startsWith(root + path.sep)) {
    throw new Error("Storage key escapes the storage root");
  }
  return dir;
}

export const NORMALIZED_AUDIO = "normalized.wav";

export const ALLOWED_EXTENSIONS = [
  ".wav",
  ".mp3",
  ".m4a",
  ".aac",
  ".ogg",
  ".opus",
  ".flac",
  ".webm",
  ".wma",
  ".dss",
] as const;

export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB ?? 300);
  return (Number.isFinite(mb) && mb > 0 ? mb : 300) * 1024 * 1024;
}

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true, mode: 0o750 });
}

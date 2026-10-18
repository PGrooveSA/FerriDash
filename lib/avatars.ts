import { join } from "node:path";

/** Profile photos live on disk next to the database, one file per user. */
export const AVATAR_DIR = join(process.env.DB_PATH ? join(process.env.DB_PATH, "..") : join(process.cwd(), "data"), "avatars");
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export const avatarFile = (userId: number) => join(AVATAR_DIR, `${userId}.img`);

/** Recognises JPEG, PNG and WebP by their magic bytes (never trust the browser's file type). */
export function imageType(buf: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (String.fromCharCode(...buf.slice(0, 4)) === "RIFF" && String.fromCharCode(...buf.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

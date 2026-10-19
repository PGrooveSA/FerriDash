import { join } from "node:path";

/** Uploaded images live on disk next to the database. */
const DATA_DIR = process.env.DB_PATH ? join(process.env.DB_PATH, "..") : join(process.cwd(), "data");

// Profile photos: one file per user.
export const AVATAR_DIR = join(DATA_DIR, "avatars");
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const avatarFile = (userId: number) => join(AVATAR_DIR, `${userId}.img`);

// School logos: one file per school.
export const LOGO_DIR = join(DATA_DIR, "logos");
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const logoFile = (schoolId: number) => join(LOGO_DIR, `${schoolId}.img`);

// Expense documents (PDF only): one file per expense.
export const EXPENSE_DOC_DIR = join(DATA_DIR, "expense-docs");
export const MAX_EXPENSE_DOC_BYTES = 10 * 1024 * 1024;
export const expenseDocFile = (expenseId: number) => join(EXPENSE_DOC_DIR, `${expenseId}.pdf`);
/** A real PDF starts with "%PDF-" (checked instead of trusting the file name or browser type). */
export const isPdf = (buf: Uint8Array) => buf.length > 5 && String.fromCharCode(...buf.slice(0, 5)) === "%PDF-";

/** Recognises JPEG, PNG and WebP by their magic bytes (never trust the browser's file type). */
export function imageType(buf: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (String.fromCharCode(...buf.slice(0, 4)) === "RIFF" && String.fromCharCode(...buf.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** Headers for serving an uploaded image whose URL carries a ?v= version. */
export const imageHeaders = (type: string, visibility: "public" | "private") => ({
  "Content-Type": type,
  "Cache-Control": `${visibility}, max-age=31536000, immutable`,
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'",
});

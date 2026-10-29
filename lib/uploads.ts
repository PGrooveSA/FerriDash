// Upload limits and file-type checks. Where files are stored: lib/storage.ts.

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // profile photos
export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // school logos
export const MAX_EXPENSE_DOC_BYTES = 4 * 1024 * 1024; // expense PDFs (Vercel accepts request bodies up to 4.5 MB)
export const MAX_MESSAGE_FILE_BYTES = 5 * 1024 * 1024; // message attachments (uploaded straight to storage)

/** Files that can be attached to a message, by extension, with the type they are stored and served as. */
export const MESSAGE_FILE_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  pdf: "application/pdf", txt: "text/plain", csv: "text/csv",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
export const fileExt = (name: string) => (/\.([A-Za-z0-9]+)$/.exec(name)?.[1] ?? "").toLowerCase();
export const fmtBytes = (n: number) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

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

// Upload limits and file-type checks. Where files are stored: lib/storage.ts.

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // profile photos
export const MAX_BANNER_BYTES = 3 * 1024 * 1024; // profile banners (resized in the browser first)
export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // school logos
export const MAX_EXPENSE_DOC_BYTES = 4 * 1024 * 1024; // expense PDFs (Vercel accepts request bodies up to 4.5 MB)
export const MAX_ASSIGNMENT_DOC_BYTES = 4 * 1024 * 1024; // assignment PDFs (through the app server, like expense PDFs)
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

/**
 * True when a message attachment's bytes really are the kind its extension claims: pictures and PDFs by their
 * signature, Office files as ZIP (docx/xlsx/pptx) or OLE (doc/xls/ppt) containers, text and CSV as text with no
 * binary bytes. A renamed program or web page is refused.
 */
export function attachmentMatches(ext: string, buf: Uint8Array): boolean {
  const head = (n: number) => String.fromCharCode(...buf.slice(0, n));
  const starts = (...bytes: number[]) => bytes.every((b, i) => buf[i] === b);
  switch (ext) {
    case "jpg": case "jpeg": return imageType(buf) === "image/jpeg";
    case "png": return imageType(buf) === "image/png";
    case "webp": return imageType(buf) === "image/webp";
    case "gif": return head(6) === "GIF87a" || head(6) === "GIF89a";
    case "pdf": return isPdf(buf);
    case "docx": case "xlsx": case "pptx": return starts(0x50, 0x4b, 0x03, 0x04);
    case "doc": case "xls": case "ppt": return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    case "txt": case "csv": {
      const sample = buf.slice(0, 64 * 1024);
      if (sample.includes(0)) return false;
      const text = new TextDecoder("utf-8", { fatal: false }).decode(sample).trimStart().slice(0, 200).toLowerCase();
      return !/^(<!doctype|<html|<script|<svg|<\?xml)/.test(text);
    }
    default: return false;
  }
}

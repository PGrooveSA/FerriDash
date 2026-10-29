// Uploaded files (profile photos, school logos, expense PDFs, message attachments).
// Production: a private Supabase Storage bucket, reached with the server-only service role key.
// Development (no Supabase keys): a local folder, data/uploads. Files are never served directly:
// FerriDash's own /api routes check who is asking, then stream the bytes.
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "ferridash-uploads";
const g = globalThis as unknown as { __ferriStorage?: SupabaseClient; __ferriBucket?: Promise<void> };

function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  g.__ferriStorage ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return g.__ferriStorage;
}

/** Creates the private bucket the first time it's needed. */
function bucketReady(sb: SupabaseClient): Promise<void> {
  g.__ferriBucket ??= (async () => {
    const { data } = await sb.storage.getBucket(BUCKET);
    if (data) return;
    const { error } = await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 11 * 1024 * 1024 });
    if (error && !/already exists/i.test(error.message)) throw new Error(`Could not create storage bucket: ${error.message}`);
  })().catch((e) => { g.__ferriBucket = undefined; throw e; });
  return g.__ferriBucket;
}

const LOCAL_DIR = join(process.cwd(), "data", "uploads");
const localPath = (key: string) => join(LOCAL_DIR, ...key.split("/"));

/** Keys used across the app. */
export const storageKey = {
  avatar: (userId: number) => `avatars/${userId}.img`,
  logo: (schoolId: number) => `logos/${schoolId}.img`,
  expenseDoc: (expenseId: number) => `expense-docs/${expenseId}.pdf`,
  /** Random part, so a key can't be guessed from another one. */
  messageFile: (convId: number, random: string, ext: string) => `messages/${convId}/${random}.${ext}`,
};

export async function putFile(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const sb = supabase();
  if (!sb) {
    await mkdir(dirname(localPath(key)), { recursive: true });
    await writeFile(localPath(key), bytes);
    return;
  }
  await bucketReady(sb);
  const { error } = await sb.storage.from(BUCKET).upload(key, bytes, { contentType, upsert: true, cacheControl: "0" });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

/** The file's bytes, or null if there is none. */
export async function getFile(key: string): Promise<Uint8Array | null> {
  const sb = supabase();
  if (!sb) {
    try { return new Uint8Array(await readFile(localPath(key))); } catch { return null; }
  }
  await bucketReady(sb);
  const { data, error } = await sb.storage.from(BUCKET).download(key);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * A one-time link the browser can upload this file to itself, so large files skip the app server (Vercel
 * refuses request bodies over 4.5 MB). Null in development, where the app's own route takes the upload.
 */
export async function signedUploadUrl(key: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  await bucketReady(sb);
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(key);
  if (error || !data) throw new Error(`Could not prepare the upload: ${error?.message}`);
  return data.signedUrl;
}

/** A short-lived download link (production), or null when the app serves the file itself (development). */
export async function signedDownloadUrl(key: string, fileName: string, seconds = 300): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(key, seconds, { download: fileName });
  if (error || !data) return null;
  return data.signedUrl;
}

/** The stored file's size in bytes, or null if there is no such file. */
export async function fileSize(key: string): Promise<number | null> {
  const sb = supabase();
  if (!sb) {
    try { return (await stat(localPath(key))).size; } catch { return null; }
  }
  await bucketReady(sb);
  const slash = key.lastIndexOf("/");
  const { data } = await sb.storage.from(BUCKET).list(key.slice(0, slash), { search: key.slice(slash + 1), limit: 10 });
  const hit = data?.find((f) => f.name === key.slice(slash + 1));
  return hit ? Number(hit.metadata?.size ?? 0) : null;
}

export async function removeFile(key: string): Promise<void> {
  const sb = supabase();
  if (!sb) { await rm(localPath(key), { force: true }); return; }
  await bucketReady(sb);
  await sb.storage.from(BUCKET).remove([key]);
}

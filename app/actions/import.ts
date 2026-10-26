"use server";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/lib/auth";
import { ADMIN } from "@/lib/action-utils";
import { analyse, MAX_IMPORT_BYTES, type Credential, type ImportKind, type ImportPreview } from "@/lib/importer";

export type ImportState = { error?: string; preview?: ImportPreview; done?: { message: string; credentials: Credential[] } };

const KINDS: ImportKind[] = ["teachers", "classes", "learners"];

async function withImport(kind: string, text: string, fn: (ctx: Awaited<ReturnType<typeof requireCtx>>, k: ImportKind) => Promise<ImportState>): Promise<ImportState> {
  const ctx = await requireCtx(ADMIN);
  if (!KINDS.includes(kind as ImportKind)) return { error: "Unknown import type." };
  if (typeof text !== "string" || !text.trim()) return { error: "Choose a CSV file first." };
  if (text.length > MAX_IMPORT_BYTES) return { error: "The file is too large (5 MB maximum). Split it into smaller files." };
  try {
    return await fn(ctx, kind as ImportKind);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("!")) return { error: msg.slice(1) };
    console.error(e);
    return { error: "The import failed and nothing was saved. Please check the file and try again." };
  }
}

/** Step 1: check the file and show what would happen. Nothing is saved. */
export async function previewImport(kind: string, text: string): Promise<ImportState> {
  return withImport(kind, text, async (ctx, k) => ({ preview: (await analyse(ctx, k, text)).preview }));
}

/** Step 2: check again against the current data, then save everything in one transaction. */
export async function runImport(kind: string, text: string): Promise<ImportState> {
  return withImport(kind, text, async (ctx, k) => {
    const done = await (await analyse(ctx, k, text)).apply();
    for (const p of ["/teachers", "/learners", "/parents", "/academics", "/dashboard"]) revalidatePath(p);
    return { done };
  });
}

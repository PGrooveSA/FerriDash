"use client";
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { printPage } from "@/components/ui/forms";
import { useT } from "@/components/I18nProvider";

/**
 * Shows a PDF inside the page, one picture per page (pdf.js). Phones can't always open a PDF themselves: the
 * FerriDash Android app's web view has no PDF viewer, and links that open a new window do nothing there.
 */
export function PdfViewer({ src }: { src: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const t = useT();

  useEffect(() => {
    let cancelled = false;
    let doc: { destroy(): unknown } | undefined;
    (async () => {
      try {
        // The legacy build also runs on older phone web views.
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
        const res = await fetch(src, { credentials: "same-origin" });
        if (!res.ok) throw new Error(String(res.status));
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await res.arrayBuffer()) }).promise;
        doc = pdf;
        const el = box.current!;
        el.replaceChildren();
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= pdf.numPages && !cancelled; i++) {
          const page = await pdf.getPage(i);
          // Sharp on screen, and at least 1.5x so a saved or printed copy stays readable.
          const scale = Math.max((el.clientWidth * ratio) / page.getViewport({ scale: 1 }).width, 1.5);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "pdf-page w-full h-auto rounded-xl bg-white shadow";
          canvas.setAttribute("aria-label", t("Page {n} of {total}", { n: i, total: pdf.numPages }));
          el.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
          if (i === 1 && !cancelled) setState("ready");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => { cancelled = true; doc?.destroy(); };
  }, [src]);

  return (
    <>
      {state === "loading" && <p className="text-sm muted py-10 text-center no-print">{t("Opening the PDF…")}</p>}
      {state === "error" && <p className="text-sm py-10 text-center no-print">{t("The PDF couldn't be shown here. Use Download to open it on your device.")}</p>}
      <div ref={box} className="pdf-pages space-y-4" />
    </>
  );
}

/**
 * Download button for a PDF. In a browser it saves the file. The FerriDash phone apps can't download files, so there it
 * opens the phone's print dialog for the pages shown above, where "Save as PDF" keeps a copy on the phone.
 */
export function PdfDownload({ src, name }: { src: string; name: string }) {
  const [inApp, setInApp] = useState(false);
  const t = useT();
  useEffect(() => setInApp(navigator.userAgent.includes("FerriDashApp")), []);
  const icon = <Download className="w-4 h-4" />;
  if (!inApp) return <a href={`${src}?download`} download={name} className="btn btn-primary">{icon}{t("Download")}</a>;
  return (
    <button type="button" className="btn btn-primary" onClick={() => {
      const title = document.title;
      document.title = name.replace(/\.pdf$/i, "");
      printPage(document.title);
      setTimeout(() => { document.title = title; }, 1500);
    }}>{icon}{t("Save PDF")}</button>
  );
}

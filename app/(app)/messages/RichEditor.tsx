"use client";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useT } from "@/components/I18nProvider";
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, List, ListOrdered, Palette, Smile, Strikethrough, Table, Type, Underline } from "lucide-react";

export type Mentionable = { id: number; name: string; role: string };
export type RichEditorHandle = { html(): string; isEmpty(): boolean; clear(): void; focus(): void };

const EMOJI = "😀 😁 😂 🤣 😊 😍 😘 😎 🤩 🥳 😇 🙂 😉 🤔 😮 😢 😭 😡 😴 🤗 🙏 👍 👎 👏 🙌 👋 💪 ✌️ 👌 ✅ ❌ ⭐ 🔥 🎉 🎓 📚 ✏️ 📝 📅 ⏰ 🏫 ⚽ 🏆 ❤️ 💙 💚 💛 🧡".split(" ");
const COLORS = ["#0f172a", "#64748b", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0284c7", "#4f46e5", "#9333ea", "#db2777"];
const SIZES: [string, string][] = [["Small", "2"], ["Normal", "3"], ["Large", "5"], ["Huge", "6"]];
const ROLE: Record<string, string> = { school_admin: "Admin", teacher: "Educator", parent: "Parent", learner: "Learner" };
type Menu = null | "emoji" | "color" | "size" | "align" | "table";

/**
 * The chat's message box: formatting toolbar (emoji, bold, italic, underline, strikethrough, colour, size, alignment,
 * numbered and bulleted lists, tables) and @mentions. Uses the browser's built-in editing, which also works in the
 * FerriDash phone apps. What it produces is cleaned again on the server (lib/richtext.ts).
 */
const RichEditor = forwardRef<RichEditorHandle, { placeholder: string; mentionables: Mentionable[]; onEnter(): void; disabled?: boolean }>(
  function RichEditor({ placeholder, mentionables, onEnter, disabled }, ref) {
    const box = useRef<HTMLDivElement>(null);
    const t = useT();
    const saved = useRef<Range | null>(null);
    const [menu, setMenu] = useState<Menu>(null);
    const [empty, setEmpty] = useState(true);
    const [mention, setMention] = useState<{ q: string; pick: number } | null>(null);
    const [grid, setGrid] = useState<[number, number]>([2, 2]);

    useImperativeHandle(ref, () => ({
      html: () => box.current?.innerHTML ?? "",
      isEmpty: () => isBlank(box.current),
      clear: () => { if (box.current) box.current.innerHTML = ""; setEmpty(true); setMention(null); },
      focus: () => box.current?.focus(),
    }));

    const isBlank = (el: HTMLElement | null) => !el || (!el.textContent?.trim() && !el.querySelector("table, [data-mention]"));
    const remember = () => {
      const sel = window.getSelection();
      if (sel?.rangeCount && box.current?.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange();
    };
    const restore = () => {
      box.current?.focus();
      const sel = window.getSelection();
      if (saved.current && sel) { sel.removeAllRanges(); sel.addRange(saved.current); }
    };
    const exec = (cmd: string, value?: string) => {
      restore();
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand(cmd, false, value);
      setMenu(null);
      changed();
    };

    // What has been typed after an "@" right before the cursor, if anything.
    const mentionQuery = (): string | null => {
      const sel = window.getSelection();
      const node = sel?.anchorNode;
      if (!sel?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !box.current?.contains(node)) return null;
      const m = /(?:^|\s)@([\p{L}' -]{0,24})$/u.exec((node.textContent ?? "").slice(0, sel.anchorOffset).replace(/ /g, " "));
      return m && !m[1].includes("  ") ? m[1] : null;
    };
    const changed = () => {
      setEmpty(isBlank(box.current));
      remember();
      const q = mentionQuery();
      setMention(q === null ? null : (cur) => ({ q, pick: cur?.q === q ? cur.pick : 0 }));
    };
    const matches = mention ? mentionables.filter((p) => p.name.toLowerCase().includes(mention.q.trim().toLowerCase())).slice(0, 6) : [];

    const insertMention = (p: Mentionable) => {
      const sel = window.getSelection();
      const node = sel?.anchorNode;
      if (!sel || !node || node.nodeType !== Node.TEXT_NODE) return;
      const before = (node.textContent ?? "").slice(0, sel.anchorOffset);
      const at = before.lastIndexOf("@");
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, sel.anchorOffset);
      range.deleteContents();
      const chip = document.createElement("span");
      chip.className = "mention";
      chip.dataset.mention = String(p.id);
      chip.contentEditable = "false";
      chip.textContent = `@${p.name}`;
      const space = document.createTextNode(" ");
      range.insertNode(space);
      range.insertNode(chip);
      range.setStartAfter(space);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      setMention(null);
      changed();
    };

    const insertTable = () => {
      const [r, c] = grid;
      const row = `<tr>${"<td><br></td>".repeat(c)}</tr>`;
      const before = new Set(box.current?.querySelectorAll("table"));
      exec("insertHTML", `<table><tbody>${row.repeat(r)}</tbody></table><div><br></div>`);
      // Start typing in the new table's first cell.
      const cell = [...(box.current?.querySelectorAll("table") ?? [])].find((t) => !before.has(t))?.querySelector("td");
      const sel = window.getSelection();
      if (cell && sel) { const at = document.createRange(); at.setStart(cell, 0); at.collapse(true); sel.removeAllRanges(); sel.addRange(at); remember(); }
    };

    // Toolbar buttons keep the cursor in the message box.
    const keep = (e: React.SyntheticEvent) => e.preventDefault();
    const tool = (label: string, icon: React.ReactNode, onClick: () => void, active = false) => (
      <button type="button" title={t(label)} aria-label={t(label)} onMouseDown={keep} onClick={onClick} disabled={disabled}
        className={`w-8 h-8 shrink-0 grid place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 ${active ? "bg-black/10 dark:bg-white/15" : ""}`}>{icon}</button>
    );
    const toggle = (m: Menu) => { remember(); setMenu((cur) => (cur === m ? null : m)); };
    const i = "w-4 h-4";

    return (
      <div className="relative flex-1 min-w-0">
        {menu && (
          <div className="absolute bottom-full left-0 mb-2 z-30 glass-solid !rounded-2xl p-2 shadow-xl max-w-[min(20rem,calc(100vw-2rem))]" onMouseDown={keep}>
            {menu === "emoji" && <div className="grid grid-cols-8 gap-0.5">{EMOJI.map((e) => <button key={e} type="button" onMouseDown={keep} onClick={() => exec("insertText", e)} className="w-8 h-8 text-lg rounded-lg hover:bg-black/5 dark:hover:bg-white/10">{e}</button>)}</div>}
            {menu === "color" && <div className="flex flex-wrap gap-1.5 w-48">{COLORS.map((c) => <button key={c} type="button" aria-label={t("Colour")} onMouseDown={keep} onClick={() => exec("foreColor", c)} className="w-7 h-7 rounded-full ring-2 ring-white/70" style={{ background: c }} />)}</div>}
            {menu === "size" && <div className="flex flex-col">{SIZES.map(([label, v]) => <button key={v} type="button" onMouseDown={keep} onClick={() => exec("fontSize", v)} className="text-left px-3 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10" style={{ fontSize: { "2": "0.8rem", "3": "0.95rem", "5": "1.2rem", "6": "1.5rem" }[v] }}>{t(label)}</button>)}</div>}
            {menu === "align" && <div className="flex gap-1">{tool("Align left", <AlignLeft className={i} />, () => exec("justifyLeft"))}{tool("Centre", <AlignCenter className={i} />, () => exec("justifyCenter"))}{tool("Align right", <AlignRight className={i} />, () => exec("justifyRight"))}</div>}
            {menu === "table" && (
              <div>
                <p className="text-xs muted mb-1.5">{t("{rows} rows × {cols} columns", { rows: grid[0], cols: grid[1] })}</p>
                <div className="grid grid-cols-6 gap-1">
                  {Array.from({ length: 36 }, (_, k) => [Math.floor(k / 6) + 1, (k % 6) + 1]).map(([r, c]) => (
                    <button key={`${r}-${c}`} type="button" aria-label={`${r} by ${c} table`} onMouseDown={keep} onMouseEnter={() => setGrid([r, c])}
                      onClick={() => { if (grid[0] === r && grid[1] === c) insertTable(); else setGrid([r, c]); }}
                      className={`w-6 h-6 rounded border ${r <= grid[0] && c <= grid[1] ? "bg-brand-500/40 border-brand-500" : "border-line"}`} />
                  ))}
                </div>
                <button type="button" onMouseDown={keep} onClick={insertTable} className="btn btn-primary btn-sm w-full mt-2">{t("Insert table")}</button>
              </div>
            )}
          </div>
        )}
        {mention && matches.length > 0 && (
          <ul className="absolute bottom-full left-0 mb-2 z-30 glass-solid !rounded-2xl p-1 shadow-xl w-64 max-w-full" role="listbox" aria-label={t("Mention someone")}>
            {matches.map((p, k) => (
              <li key={p.id}><button type="button" onMouseDown={keep} onClick={() => insertMention(p)} role="option" aria-selected={k === mention.pick}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm flex justify-between gap-2 ${k === mention.pick ? "bg-brand-500/15" : "hover:bg-black/5 dark:hover:bg-white/10"}`}>
                <span className="truncate font-medium">{p.name}</span><span className="text-xs muted shrink-0">{t(ROLE[p.role] ?? "")}</span></button></li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-0.5 overflow-x-auto pb-1 -mx-1 px-1 muted" role="toolbar" aria-label={t("Formatting")}>
          {tool("Emoji", <Smile className={i} />, () => toggle("emoji"), menu === "emoji")}
          {tool("Bold", <Bold className={i} />, () => exec("bold"))}
          {tool("Italic", <Italic className={i} />, () => exec("italic"))}
          {tool("Underline", <Underline className={i} />, () => exec("underline"))}
          {tool("Strikethrough", <Strikethrough className={i} />, () => exec("strikeThrough"))}
          {tool("Text colour", <Palette className={i} />, () => toggle("color"), menu === "color")}
          {tool("Font size", <Type className={i} />, () => toggle("size"), menu === "size")}
          {tool("Align", <AlignLeft className={i} />, () => toggle("align"), menu === "align")}
          {tool("Numbered list", <ListOrdered className={i} />, () => exec("insertOrderedList"))}
          {tool("Bullets", <List className={i} />, () => exec("insertUnorderedList"))}
          {tool("Table", <Table className={i} />, () => toggle("table"), menu === "table")}
          {tool("Mention someone", <span className="text-sm font-bold">@</span>, () => exec("insertText", " @"))}
        </div>
        <div ref={box} contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-multiline aria-label={t("Message")} data-placeholder={placeholder}
          className={`rt input !rounded-3xl max-h-40 min-h-[2.75rem] overflow-y-auto break-words ${empty ? "rt-empty" : ""}`}
          onInput={changed} onKeyUp={remember} onMouseUp={remember} onBlur={() => setTimeout(() => setMention(null), 150)}
          onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
          onKeyDown={(e) => {
            if (mention && matches.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setMention({ ...mention, pick: (mention.pick + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length }); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(matches[mention.pick]); return; }
              if (e.key === "Escape") { setMention(null); return; }
            }
            // Enter sends on a keyboard; Shift+Enter, lists, tables and phone keyboards get a new line.
            const at = window.getSelection()?.anchorNode;
            const inBlock = (at?.nodeType === Node.ELEMENT_NODE ? (at as Element) : at?.parentElement)?.closest("li, td, th");
            if (e.key === "Enter" && !e.shiftKey && !inBlock && !window.matchMedia("(pointer: coarse)").matches) { e.preventDefault(); onEnter(); }
          }} />
      </div>
    );
  });

export default RichEditor;

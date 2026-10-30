import sanitizeHtml from "sanitize-html";

// Chat messages written with the formatting toolbar are stored as HTML inside <div class="rt">…</div>.
// Older messages (and anything without that wrapper) are plain text. Everything is cleaned on save and
// again before display, so only the formatting below can ever reach the page.

const RT_OPEN = '<div class="rt">';
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\))$/i;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["b", "strong", "i", "em", "u", "s", "strike", "del", "span", "font", "br", "div", "p", "ul", "ol", "li", "table", "thead", "tbody", "tr", "td", "th"],
  allowedAttributes: {
    span: ["style", "class", "data-mention"], font: ["color", "size"],
    div: ["style", "class"], p: ["style"], li: ["style"], td: ["style"], th: ["style"],
  },
  allowedClasses: { span: ["mention"], div: ["rt"] },
  allowedStyles: {
    "*": {
      color: [COLOR],
      "font-size": [/^(x-small|small|medium|large|x-large|xx-large|xxx-large|\d{1,2}px)$/],
      "text-align": [/^(left|right|center|justify|start|end)$/],
      "text-decoration": [/^(underline|line-through)( (underline|line-through))?$/],
      "text-decoration-line": [/^(underline|line-through)( (underline|line-through))?$/],
      "font-weight": [/^(bold|700)$/],
      "font-style": [/^italic$/],
    },
  },
  allowedSchemes: [],
};

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Cleans what the editor sent and wraps it, ready to store. */
export function cleanMessageHtml(html: string): string {
  const inner = sanitizeHtml(html.startsWith(RT_OPEN) ? html.slice(RT_OPEN.length, html.endsWith("</div>") ? -6 : undefined) : html, OPTIONS);
  return RT_OPEN + inner + "</div>";
}

/** Safe HTML to show a stored message. */
export function messageHtml(body: string): string {
  if (!body) return "";
  if (body.startsWith(RT_OPEN)) return sanitizeHtml(body, OPTIONS);
  return `<div class="rt">${escape(body).replace(/\r?\n/g, "<br>")}</div>`;
}

/** Plain text of a message, for previews and length checks. */
export function messageText(body: string | null): string {
  if (!body) return "";
  if (!body.startsWith(RT_OPEN)) return body;
  return sanitizeHtml(body.replace(/<\/?(br|p|div|li|ol|ul|tr|td|th|table)[^>]*>/gi, " "), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}

/** User ids mentioned in a message (@Name chips). */
export function mentionIds(html: string): number[] {
  return [...new Set([...html.matchAll(/data-mention="(\d+)"/g)].map((m) => Number(m[1])))];
}

/** Turns mentions of these ids back into plain text (someone the sender may not mention). */
export function dropMentions(html: string, ids: number[]): string {
  if (!ids.length) return html;
  return html.replace(/<span([^>]*)data-mention="(\d+)"([^>]*)>(.*?)<\/span>/g, (all, _a, id, _b, text) => ids.includes(Number(id)) ? text : all);
}

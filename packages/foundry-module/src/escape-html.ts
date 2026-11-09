// The same five characters foundry.utils.escapeHTML replaces in v14, kept local because
// that helper isn't confirmed in v13, this module's minimum.
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

/** Escape text so it renders as written when Foundry inserts it as HTML, also inside attributes. */
export function escapeHTML(text: string): string {
  return String(text).replace(/[&<>"']/g, c => HTML_ESCAPES[c] ?? c);
}

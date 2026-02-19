// Shared: lightweight YAML frontmatter parser.
// Zero dependencies — regex-based, handles single-line key: value pairs only.
// Supports CRLF, quoted values, and inline comments.

/**
 * Parse YAML frontmatter from markdown content.
 * Returns { attrs: { key: value, ... }, body: "content after ---" }.
 * Returns { attrs: {}, body: content } if no frontmatter found.
 */
function parseFrontmatter(content) {
  if (typeof content !== 'string') return { attrs: {}, body: '' };
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)(?:\n)?---(?:\n|$)/);
  if (!match) return { attrs: {}, body: normalized };

  const attrs = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2].trim();
    // Strip inline comments (but not inside quotes)
    if (!val.startsWith('"') && !val.startsWith("'")) {
      val = val.replace(/\s+#.*$/, '');
    }
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    attrs[kv[1]] = val;
  }

  const body = normalized.slice(match[0].length);
  return { attrs, body };
}

/**
 * Strip frontmatter from markdown, returning only the body content.
 */
function stripFrontmatter(content) {
  return parseFrontmatter(content).body;
}

module.exports = { parseFrontmatter, stripFrontmatter };

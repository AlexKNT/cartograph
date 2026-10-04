/**
 * The three pieces of formatting an explanation is allowed, and nothing else.
 *
 * Pure, and it imports nothing: the pane is a client component and this runs in
 * the browser. Forbidding formatting outright and printing whatever comes back
 * is the option that fails — a model told "plain text only" still writes
 * backticks, and the reader sees markdown with the renderer missing. Letting a
 * small subset through and rendering it is what survives contact, so this
 * consumes the markers it knows and drops the ones it does not rather than
 * printing them.
 *
 * A path is a link because the pane can move the map. Which token counts as a
 * path is the caller's question: it passes the repository's own file list.
 */

export type Span =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "path"; path: string }
  /** Bold, whose inside is parsed the same way, so a path in bold still links. */
  | { kind: "strong"; spans: Span[] };

export type Block =
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "bullets"; items: Span[][] };

/** A line that is nothing but markers is a horizontal rule the prompt forbade. */
const RULE = /^([-*_])\1{2,}$/;
const BULLET = /^[-*+]\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;

function linkify(text: string, isPath: (text: string) => boolean): Span[] {
  const spans: Span[] = [];

  for (const part of text.split(/(\s+)/)) {
    if (part === "") continue;
    if (/^\s+$/.test(part)) {
      spans.push({ kind: "text", text: part });
      continue;
    }

    if (isPath(part)) {
      spans.push({ kind: "path", path: part });
      continue;
    }

    // A sentence ends "see src/a.ts." — the path is still the path.
    const trimmed = part.replace(/[.,;:)\]}]+$/, "");
    if (trimmed !== "" && trimmed !== part && isPath(trimmed)) {
      spans.push({ kind: "path", path: trimmed });
      spans.push({ kind: "text", text: part.slice(trimmed.length) });
      continue;
    }

    spans.push({ kind: "text", text: part });
  }

  return spans;
}

function parseInline(text: string, isPath: (text: string) => boolean): Span[] {
  const spans: Span[] = [];
  let buffer = "";

  const flush = (): void => {
    if (buffer === "") return;
    spans.push(...linkify(buffer, isPath));
    buffer = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "`") {
      const close = text.indexOf("`", index + 1);
      if (close !== -1) {
        flush();
        const content = text.slice(index + 1, close).trim();
        spans.push(
          content !== "" && isPath(content)
            ? { kind: "path", path: content }
            : { kind: "code", text: content },
        );
        index = close;
      }
      // An unclosed backtick is a stray marker: consumed, not printed.
      continue;
    }

    if (char === "*") {
      if (text[index + 1] === "*") {
        const close = text.indexOf("**", index + 2);
        if (close !== -1) {
          flush();
          const inner = text.slice(index + 2, close);
          if (inner !== "") spans.push({ kind: "strong", spans: parseInline(inner, isPath) });
          index = close + 1;
          continue;
        }
        index += 1;
        continue;
      }
      continue;
    }

    buffer += char;
  }

  flush();
  return spans;
}

/**
 * An explanation as blocks and spans, with every path the repository really has
 * marked as a path. Nothing is rendered from a markdown library: the model was
 * permitted three things and this is a renderer for exactly three things.
 */
export function parseExplanation(body: string, isPath: (text: string) => boolean): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let bullets: Span[][] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join(" "), isPath) });
    paragraph = [];
  };
  const flushBullets = (): void => {
    if (bullets.length === 0) return;
    blocks.push({ kind: "bullets", items: bullets });
    bullets = [];
  };

  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();

    if (line === "" || RULE.test(line)) {
      flushParagraph();
      flushBullets();
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet !== null) {
      flushParagraph();
      bullets.push(parseInline(bullet[1], isPath));
      continue;
    }

    const heading = HEADING.exec(line);
    // The prompt forbids headings; if one arrives, its text is kept and its
    // marker is not.
    paragraph.push(heading === null ? line : heading[1]);
    flushBullets();
  }

  flushParagraph();
  flushBullets();
  return blocks;
}

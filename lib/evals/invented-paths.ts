/**
 * The invented-path check, as arithmetic.
 *
 * Deterministic, and that is the point: "did the model name a file that is not
 * there" has an exact answer, and a hallucination detector that hallucinates is
 * worth nothing. Every token that looks like a path is tested against the paths
 * the prompt held — nothing else is consulted.
 *
 * The same extractor builds both sides of the test, so the check cannot accuse
 * a token the prompt also spelled: something is flagged only when it is
 * path-shaped in the answer and was not path-shaped in what was shown.
 *
 * A bare folder name with no extension (`src/components`) is prose as often as
 * it is a path, so it is not claimed. Missing an invented folder is a false
 * negative; accusing the word "and/or" would be a false positive, and a check
 * that cries wolf on prose is worse than one that misses a folder.
 */

const CODE_EXTENSION = /\.(?:[cm]?[jt]sx?|json|css|scss|html?|mdx?)$/i;

/** A URL is not a repository path, whatever it looks like. */
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Explicitly relative or aliased, so it names a path even without an extension. */
const PREFIXED = /^(?:@\/|\/)/;

/** `readFile.ts:42` and `readFile.ts:42-51` name the same file. */
const LINE_SUFFIX = /:\d+(?:-\d+)?$/;

function clean(raw: string): string {
  return raw
    .replace(/^[`*"'(\[{<]+/, "")
    .replace(/[.,;:!?`*"')\]}<>]+$/, "")
    .replace(LINE_SUFFIX, "")
    .replace(/^\.\//, "");
}

function isPathShaped(token: string): boolean {
  if (token === "" || SCHEME.test(token)) return false;
  if (CODE_EXTENSION.test(token)) return true;
  if (!token.includes("/")) return false;
  if (PREFIXED.test(token)) return true;

  // A slash alone is not a path: "and/or" has one. A dot in a segment is what
  // separates a path from prose.
  return token.split("/").some((segment) => segment.includes("."));
}

/** Every path-shaped token in the text, first-seen order, without repeats. */
export function pathTokens(text: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const raw of text.split(/\s+/)) {
    const token = clean(raw);
    if (!isPathShaped(token) || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }

  return tokens;
}

/** The path-shaped tokens in an answer that were not in the set it was shown. */
export function findInventedPaths(body: string, shown: ReadonlySet<string>): string[] {
  return pathTokens(body).filter((token) => !shown.has(token));
}

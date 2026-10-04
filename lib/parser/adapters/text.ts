/**
 * The leading string directive of a module, read without parsing the file.
 *
 * A framework directive is the first statement, so anything before it is
 * whitespace or a comment. Reading it here costs nothing, which matters when it
 * runs over every file in a repository.
 */
export function leadingDirective(text: string): string | null {
  let index = 0;
  if (text.charCodeAt(0) === 0xfeff) index = 1;

  for (;;) {
    const code = text.charCodeAt(index);

    if (code === 32 || code === 9 || code === 10 || code === 13) {
      index += 1;
      continue;
    }

    if (code === 47 /* / */ && text.charCodeAt(index + 1) === 47) {
      const end = text.indexOf("\n", index + 2);
      index = end === -1 ? text.length : end + 1;
      continue;
    }

    if (code === 47 /* / */ && text.charCodeAt(index + 1) === 42 /* * */) {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 2;
      continue;
    }

    break;
  }

  const quote = text[index];
  if (quote !== '"' && quote !== "'") return null;

  const end = text.indexOf(quote, index + 1);
  return end === -1 ? null : text.slice(index + 1, end);
}

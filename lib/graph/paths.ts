/** The last segment of a repository-relative path. */
export function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

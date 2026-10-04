/**
 * Framework knowledge reaches the parser only through this. The core asks an
 * adapter questions; it never tests which framework it is looking at.
 */

export interface RepositoryAdapter {
  /** Recorded in the output, so the interface can say what it was looking at. */
  readonly name: string;
  /**
   * Files that start the graph for this framework, whether or not anything
   * imports them. Repository-relative POSIX paths.
   */
  entryPoints(): readonly string[];
}

/**
 * The adapter for a repository that uses no framework. It asserts nothing: file
 * selection is structural, so the walk already keeps every directory holding code.
 */
export const FALLBACK_ADAPTER: RepositoryAdapter = {
  name: "none",
  entryPoints: () => [],
};

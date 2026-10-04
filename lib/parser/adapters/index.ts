/**
 * Framework knowledge reaches the parser only through this. The core asks an
 * adapter about a file; it never tests which framework it is looking at.
 */

/** One file the parser read, handed to an adapter: where it is, and what it
 *  says. Nothing here mentions a web framework, so the interface stays neutral
 *  about what an adapter knows. */
export interface ParsedSource {
  /** Repository-relative, POSIX separators. */
  path: string;
  text: string;
}

/** A route an adapter recovered. The file it came from is added by the parser. */
export interface AdapterRoute {
  /** Null when the surface has no HTTP method, as a Next.js page does. */
  method: string | null;
  /** The full pattern, or the route is not emitted at all. */
  route: string;
}

export interface RepositoryAdapter {
  /** Recorded in the output, so the interface can say what it was looking at. */
  readonly name: string;
  /**
   * Files that start the graph for this framework, whether or not anything
   * imports them. Repository-relative POSIX paths.
   */
  entryPoints(paths: readonly string[]): readonly string[];
  /** The role this file plays, or null when the framework says nothing about it. */
  roleOf(source: ParsedSource): string | null;
  /** Every route this file is exactly, or none. */
  routesOf(source: ParsedSource): readonly AdapterRoute[];
}

/**
 * The adapter for a repository that uses no framework. It asserts nothing: file
 * selection is structural, so the walk already keeps every directory holding
 * code, and there is no framework convention to read a role or a route off.
 */
export const FALLBACK_ADAPTER: RepositoryAdapter = {
  name: "none",
  entryPoints: () => [],
  roleOf: () => null,
  routesOf: () => [],
};

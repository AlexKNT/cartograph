import { dirname, join, relative, resolve as absolute, sep } from "node:path";
import { ts } from "ts-morph";

export interface PathMapping {
  /** As written in the config, e.g. "@/*". */
  pattern: string;
  /** Targets with their "*" kept, repository-relative where they point inside it. */
  targets: string[];
}

export interface ResolutionHints {
  /** Repository-relative directory; non-relative specifiers are tried under it. */
  baseUrl: string | null;
  pathMappings: PathMapping[];
}

export const NO_HINTS: ResolutionHints = { baseUrl: null, pathMappings: [] };

const CONFIG_FILES = ["tsconfig.json", "jsconfig.json"];

function toRepositoryPath(root: string, path: string): string {
  const relativePath = relative(root, path).split(sep).join("/");
  return relativePath === "" ? "." : relativePath;
}

/**
 * Reads the project's `baseUrl` and `paths`.
 *
 * Aliases like `@/lib/env` are the TypeScript compiler's own resolution
 * configuration, not framework knowledge, and without them every aliased import
 * in a modern repository reports as unresolved — a coverage report full of
 * failures the parser could have answered. A config that cannot be read is not
 * an error here: it just leaves the hints empty, and the imports it would have
 * resolved are reported unresolved with a reason like any other.
 */
export function readResolutionHints(root: string): ResolutionHints {
  for (const name of CONFIG_FILES) {
    const configPath = join(root, name);

    let config: unknown;
    try {
      const read = ts.readConfigFile(configPath, ts.sys.readFile);
      if (read.error !== undefined || read.config === undefined) continue;
      config = read.config;
    } catch {
      continue;
    }

    try {
      const parsed = ts.parseJsonConfigFileContent(config, ts.sys, dirname(configPath));
      const options = parsed.options;
      const baseUrl =
        options.baseUrl === undefined
          ? null
          : toRepositoryPath(root, options.baseUrl);
      const baseDirectory = options.baseUrl ?? dirname(configPath);

      return {
        baseUrl,
        pathMappings: Object.entries(options.paths ?? {}).map(
          ([pattern, targets]) => ({
            pattern,
            targets: targets.map((target) =>
              toRepositoryPath(root, absolute(baseDirectory, target)),
            ),
          }),
        ),
      };
    } catch {
      continue;
    }
  }

  return NO_HINTS;
}

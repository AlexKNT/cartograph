import { extname } from "node:path";

/** Files that become nodes. Anything else can still be imported, and is reported as excluded. */
export const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

/** Order TypeScript probes them in, declaration files included. */
export const TYPE_SCRIPT_EXTENSIONS = [".ts", ".tsx", ".d.ts", ".mts", ".cts"] as const;

export const JAVA_SCRIPT_EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs"] as const;

const DECLARATION_SUFFIX = /\.d\.ts$/;
const MODULE_SUFFIX = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export function extensionOf(path: string): string {
  return extname(path).toLowerCase();
}

export function hasSourceExtension(path: string): boolean {
  return (SOURCE_EXTENSIONS as readonly string[]).includes(extensionOf(path));
}

/** The directory holding a repository-relative path; "." at the root. */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "." : path.slice(0, slash);
}

/**
 * A file's module name: folder plus name without extension. An index file is
 * its folder, which is what makes a barrel file stand for the directory it
 * re-exports rather than for itself.
 */
export function moduleOf(path: string): string {
  const withoutExtension = path
    .replace(DECLARATION_SUFFIX, "")
    .replace(MODULE_SUFFIX, "");
  const slash = withoutExtension.lastIndexOf("/");
  const name = slash === -1 ? withoutExtension : withoutExtension.slice(slash + 1);
  if (name !== "index") return withoutExtension;
  return slash === -1 ? "." : withoutExtension.slice(0, slash);
}

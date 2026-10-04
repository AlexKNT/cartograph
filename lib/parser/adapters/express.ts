import type { RepositoryAdapter } from "./index.ts";

/**
 * Express. A role comes from the directory a file sits in — real repositories
 * write those directories singular and plural, so both are read. Routes are
 * not extracted at all: an Express app assembles them at runtime out of
 * routers, variables and middleware chains, and a route nobody can state
 * exactly is worse than no route. Absent beats a guess.
 */

/** Directory name to role. The name is read whatever case it is written in. */
const DIRECTORY_ROLES: ReadonlyMap<string, string> = new Map([
  ["route", "route"],
  ["routes", "route"],
  ["controller", "controller"],
  ["controllers", "controller"],
  ["middleware", "middleware"],
  ["middlewares", "middleware"],
  ["model", "model"],
  ["models", "model"],
]);

const TEST = /\.(test|spec)\.|(^|\/)(__tests__|tests?)\//;

/** The nearest ancestor directory that names a role, or null. */
function roleFromDirectory(path: string): string | null {
  const segments = path.split("/");
  segments.pop();

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const role = DIRECTORY_ROLES.get(segments[index].toLowerCase());
    if (role !== undefined) return role;
  }
  return null;
}

export const EXPRESS_ADAPTER: RepositoryAdapter = {
  name: "express",

  // Express names no file that starts the graph: an app is mounted by a host
  // entry script the framework knows nothing about.
  entryPoints: () => [],

  roleOf({ path }) {
    if (TEST.test(path)) return null;
    return roleFromDirectory(path);
  },

  routesOf: () => [],
};

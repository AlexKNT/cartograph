import type { RepositoryAdapter } from "./index.ts";

/**
 * React, once Next.js has been ruled out. There is no file system convention
 * for routing here — routers differ and none of them is readable from a path —
 * so this adapter assigns roles and emits no routes at all. Absent beats a
 * guess.
 */

const EXTENSION = /\.(ts|tsx|js|jsx)$/;
const HOOK = /^use[A-Z0-9_]/;
const COMPONENT = /\.(tsx|jsx)$/;
const TEST = /\.(test|spec)\.|(^|\/)(__tests__|tests?)\//;

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export const REACT_ADAPTER: RepositoryAdapter = {
  name: "react",

  entryPoints: () => [],

  roleOf({ path }) {
    if (TEST.test(path)) return null;
    const name = basename(path);
    if (HOOK.test(name) && EXTENSION.test(name)) return "hook";
    if (COMPONENT.test(name)) return "component";
    return null;
  },

  routesOf: () => [],
};

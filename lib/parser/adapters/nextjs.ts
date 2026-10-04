import type { SourceFile } from "ts-morph";
import type { AdapterRoute, RepositoryAdapter } from "./index.ts";
import { withSourceFile } from "./morph.ts";
import { leadingDirective } from "./text.ts";

/**
 * Next.js. Routable surfaces come from the file system: a `page` file is a
 * page route, a `route` file is an API endpoint, and a module marked
 * `"use server"` is a server action. Nothing here reads a component or a
 * handler body, and a path it cannot read exactly is left out rather than
 * approximated.
 */

const EXTENSION = /\.(ts|tsx|js|jsx)$/;

/** The directories a Next.js app reads routes from, in either place it allows. */
const APP_ROOTS = ["app/", "src/app/"];
const PAGES_ROOTS = ["pages/", "src/pages/"];

/** App Router files that exist only because the route does. Reached, not imported. */
const APP_REACHED = /^(page|layout|template|loading|error|global-error|not-found|route|default)\.(ts|tsx|js|jsx)$/;

/** Route handlers may export one function per method; those are the methods. */
const HTTP_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

const MIDDLEWARE = /^(middleware|instrumentation)\.(ts|js)$/;

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function underRoots(path: string, roots: readonly string[]): string | null {
  for (const root of roots) {
    if (path.startsWith(root)) return path.slice(root.length);
  }
  return null;
}

/**
 * The URL segments a directory stands for. A route group and a parallel slot
 * change nothing about the URL; an interception marker changes it in a way this
 * adapter cannot state exactly, so the whole file is left out instead.
 */
function urlSegments(directory: string): string[] | null {
  const segments: string[] = [];
  for (const segment of directory.split("/")) {
    if (segment === "") continue;
    if (/^\(\.+\)/.test(segment)) return null;
    if (segment.startsWith("@")) continue;
    if (/^\(.*\)$/.test(segment)) continue;
    segments.push(segment);
  }
  return segments;
}

/** The route pattern a file under the app root stands for, or null. */
function appRoute(relative: string): string | null {
  const slash = relative.lastIndexOf("/");
  const directory = slash === -1 ? "" : relative.slice(0, slash);
  const segments = urlSegments(directory);
  return segments === null ? null : `/${segments.join("/")}`;
}

function exportedMethods(file: SourceFile): string[] {
  const methods: string[] = [];

  for (const fn of file.getFunctions()) {
    const name = fn.getName();
    if (name !== undefined && HTTP_METHODS.has(name) && fn.isExported()) methods.push(name);
  }

  for (const declaration of file.getVariableDeclarations()) {
    const name = declaration.getName();
    if (!HTTP_METHODS.has(name)) continue;
    if (declaration.getVariableStatement()?.isExported() === true) methods.push(name);
  }

  return methods;
}

function appRole(relative: string): string | null {
  const name = basename(relative);
  if (/^page\.(ts|tsx|js|jsx)$/.test(name)) return "page-route";
  if (/^route\.(ts|tsx|js|jsx)$/.test(name)) return "api-endpoint";
  return null;
}

function pagesRole(relative: string): string | null {
  const name = basename(relative);
  if (relative.startsWith("api/")) return "api-endpoint";
  if (name.startsWith("_") || name.endsWith(".d.ts")) return null;
  return EXTENSION.test(name) ? "page-route" : null;
}

function reached(path: string): boolean {
  const app = underRoots(path, APP_ROOTS);
  if (app !== null) return APP_REACHED.test(basename(app));
  const pages = underRoots(path, PAGES_ROOTS);
  if (pages !== null) return true;
  return MIDDLEWARE.test(basename(path));
}

export const NEXT_ADAPTER: RepositoryAdapter = {
  name: "nextjs",

  entryPoints(paths) {
    return paths.filter(reached);
  },

  roleOf({ path, text }) {
    const app = underRoots(path, APP_ROOTS);
    if (app !== null) {
      const role = appRole(app);
      if (role !== null) return role;
    }

    const pages = underRoots(path, PAGES_ROOTS);
    if (pages !== null) {
      const role = pagesRole(pages);
      if (role !== null) return role;
    }

    return leadingDirective(text) === "use server" ? "server-action" : null;
  },

  routesOf({ path, text }) {
    const app = underRoots(path, APP_ROOTS);
    if (app === null) return [];

    const relative = appRoute(app);
    if (relative === null) return [];

    const name = basename(app);
    if (/^page\.(ts|tsx|js|jsx)$/.test(name)) {
      return [{ method: null, route: relative }];
    }

    if (/^route\.(ts|tsx|js|jsx)$/.test(name)) {
      return withSourceFile(path, text, (file): AdapterRoute[] =>
        exportedMethods(file).map((method) => ({ method, route: relative })),
      );
    }

    return [];
  },
};

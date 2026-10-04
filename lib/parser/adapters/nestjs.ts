import { Node, type Decorator, type SourceFile } from "ts-morph";
import type { AdapterRoute, RepositoryAdapter } from "./index.ts";
import { withSourceFile } from "./morph.ts";

/**
 * NestJS. Roles come from the filename suffix; a route is the controller's
 * prefix and the method decorator's path joined together. Both halves must be
 * string literals: an assembled controller prefix is a route this adapter
 * cannot state exactly, so none of that class's routes are emitted.
 */

const SUFFIX_ROLES: readonly (readonly [RegExp, string])[] = [
  [/\.controller\.(ts|js)$/, "controller"],
  [/\.service\.(ts|js)$/, "service"],
  [/\.module\.(ts|js)$/, "module"],
  [/\.entity\.(ts|js)$/, "entity"],
];

const HTTP_METHOD: Readonly<Record<string, string>> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
  Head: "HEAD",
  Options: "OPTIONS",
};

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The literal an argument reads, "" when it is absent, undefined when it is not a literal. */
function literalArgument(decorator: Decorator): string | undefined {
  const argument = decorator.getArguments()[0];
  if (argument === undefined) return "";
  if (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument)) {
    return argument.getLiteralText();
  }
  return undefined;
}

function joinRoute(prefix: string, relative: string): string {
  const parts = [prefix, relative]
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter((part) => part.length > 0);
  return `/${parts.join("/")}`;
}

function controllerRoutes(file: SourceFile): AdapterRoute[] {
  const routes: AdapterRoute[] = [];

  for (const declaration of file.getClasses()) {
    const controller = declaration.getDecorators().find((next) => next.getName() === "Controller");
    if (controller === undefined) continue;

    const prefix = literalArgument(controller);
    if (prefix === undefined) continue;

    for (const method of declaration.getMethods()) {
      for (const decorator of method.getDecorators()) {
        const http = HTTP_METHOD[decorator.getName()];
        if (http === undefined) continue;

        const relative = literalArgument(decorator);
        if (relative === undefined) continue;

        routes.push({ method: http, route: joinRoute(prefix, relative) });
      }
    }
  }

  return routes;
}

export const NEST_ADAPTER: RepositoryAdapter = {
  name: "nestjs",

  entryPoints(paths) {
    return paths.filter((path) => {
      const name = basename(path);
      return /\.module\.(ts|js)$/.test(name) || /^main\.(ts|js)$/.test(name);
    });
  },

  roleOf({ path }) {
    for (const [suffix, role] of SUFFIX_ROLES) {
      if (suffix.test(path)) return role;
    }
    return null;
  },

  routesOf({ path, text }) {
    if (!/\.controller\.(ts|js)$/.test(path)) return [];
    return withSourceFile(path, text, controllerRoutes);
  },
};

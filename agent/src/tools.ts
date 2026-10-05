/**
 * The six tools, and nothing else.
 *
 * Each one is a thin wrapper over the app's surface, which is where the graph
 * arithmetic lives. None of them computes anything about the repository here,
 * because the map on screen and the answer in the panel have to come from the
 * same functions or they can disagree.
 */
import { tool, type ToolRuntime } from "@langchain/core/tools";
import { z } from "zod";
import { callSurface } from "./surface.ts";

/** Named so each tool's second parameter is the runtime, not a bare object. */
type Runtime = ToolRuntime;

const path = z
  .string()
  .describe("A repository-relative file path, exactly as a previous tool returned it.");

export const repositoryTools = [
  tool(async (_input, runtime: Runtime) => callSurface("summary", {}, runtime), {
    name: "analysis_summary",
    description:
      "Summary of the whole analysis: the framework, file and edge counts, how much of the parse resolved, the categories in use, and four facts about the graph. Start here when you do not know the repository yet.",
    schema: z.object({}),
  }),

  tool(
    async (input, runtime: Runtime) => callSurface("find_files", input, runtime),
    {
      name: "find_files",
      description:
        "Find files whose repository-relative path contains a piece of text. Returns each matching path with its role, size and dependency counts. Use this to locate a file you only know part of the name of.",
      schema: z.object({
        contains: z.string().describe("Text that must appear somewhere in the path, e.g. \"auth\"."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("How many matches to return, most depended on first. Defaults to 25."),
      }),
    },
  ),

  tool(async (input, runtime: Runtime) => callSurface("files_by_role", input, runtime), {
    name: "files_by_role",
    description:
      "List the files that belong to one role, in path order. Roles are the ones the map's rail names: page, api, server action, controller, service, module, entity, component, hook, route, middleware, model, repository, util, config, test, barrel, declaration or source.",
    schema: z.object({
      role: z.string().describe("The role id, lowercase, exactly as the summary or a file reported it."),
    }),
  }),

  tool(async (input, runtime: Runtime) => callSurface("file_neighbours", input, runtime), {
    name: "file_neighbours",
    description:
      "The direct neighbours of one file: what it imports and what imports it, by path, with the kind of each edge. This is the only way to see a single file's connections.",
    schema: z.object({ path }),
  }),

  tool(async (input, runtime: Runtime) => callSurface("walk", input, runtime), {
    name: "walk_dependencies",
    description:
      "Walk the dependency graph from one file, in one direction, a few steps. `in` follows everything that depends on the file (what breaks if it changes); `out` follows everything the file needs. The walk is arithmetic over parsed edges, so it is the only way to move through the graph.",
    schema: z.object({
      path,
      direction: z.enum(["in", "out"]).describe("`in` for what depends on the file, `out` for what it needs."),
      depth: z
        .number()
        .int()
        .min(1)
        .max(4)
        .optional()
        .describe("How many steps to walk. Defaults to 2."),
    }),
  }),

  tool(async (_input, runtime: Runtime) => callSurface("routes", {}, runtime), {
    name: "route_table",
    description:
      "Every HTTP route the parser recovered exactly, with its method, its path pattern and the file it lives in. Routes whose method or full path could not both be recovered are absent, not approximated.",
    schema: z.object({}),
  }),
];

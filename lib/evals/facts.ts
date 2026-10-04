/**
 * The facts a traced explanation carried, read back out of a run.
 *
 * A trace records the function's arguments, so an `explain-file` run holds the
 * exact `FileFacts` the prompt was built from. That is what lets the checks
 * rebuild the prompt rather than trust a snapshot of it — the same promise the
 * prompt module made when it kept its builders pure.
 *
 * What comes back from LangSmith is untyped, so it is checked here rather than
 * cast. A run that does not carry the shape the prompt needs is reported as
 * skipped; scoring it would measure the wrong thing.
 */
import type { FileFacts, FolderFacts, Neighbour } from "../ai/prompts.ts";

export function fieldOf(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRole(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNeighbour(value: unknown): value is Neighbour {
  const path = fieldOf(value, "path");
  const kinds = fieldOf(value, "kinds");
  return (
    typeof path === "string" &&
    Array.isArray(kinds) &&
    kinds.every((kind) => typeof kind === "string")
  );
}

export function isFileFacts(value: unknown): value is FileFacts {
  if (!isRecord(value)) return false;
  return (
    typeof value.path === "string" &&
    typeof value.lines === "number" &&
    isRole(value.role) &&
    Array.isArray(value.imports) &&
    value.imports.every(isNeighbour) &&
    Array.isArray(value.importers) &&
    value.importers.every(isNeighbour)
  );
}

export function isFolderFacts(value: unknown): value is FolderFacts {
  if (!isRecord(value)) return false;
  return (
    typeof value.path === "string" &&
    Array.isArray(value.files) &&
    value.files.every(
      (file) => isRecord(file) && typeof file.path === "string" && isRole(file.role),
    ) &&
    Array.isArray(value.imports) &&
    value.imports.every((path) => typeof path === "string") &&
    Array.isArray(value.importedBy) &&
    value.importedBy.every((path) => typeof path === "string") &&
    Array.isArray(value.pointingIn) &&
    value.pointingIn.every((path) => typeof path === "string")
  );
}

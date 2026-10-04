import { Node, Project, SyntaxKind } from "ts-morph";
import type { EdgeKind } from "./types.ts";

/** One statement that names another module. */
export interface ImportStatement {
  /** The specifier as written, or "" when it was not a literal string. */
  specifier: string;
  kind: EdgeKind;
  /** 1-based. */
  line: number;
  /** False only for a dynamic import whose argument the parser cannot read. */
  literal: boolean;
  /** What the argument was, for a non-literal dynamic import. */
  argumentKind?: string;
}

/**
 * A project that holds nothing on disk: the parser already has the text, and
 * the target repository's own tsconfig has no say in how its syntax is read.
 */
export function createImportProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });
}

/**
 * Reads the three kinds of statement that produce an edge: a plain import, a
 * re-export, and a dynamic import with a literal string. `require()` is not
 * read here — it is a different module system and a later phase.
 */
export function readImportStatements(
  project: Project,
  path: string,
  text: string,
): ImportStatement[] {
  const sourceFile = project.createSourceFile(`/${path}`, text, {
    overwrite: true,
  });
  const statements: ImportStatement[] = [];

  try {
    for (const declaration of sourceFile.getImportDeclarations()) {
      const specifier = declaration.getModuleSpecifierValue();
      if (specifier === undefined) continue;
      statements.push({
        specifier,
        kind: "import",
        line: declaration.getStartLineNumber(),
        literal: true,
      });
    }

    for (const declaration of sourceFile.getExportDeclarations()) {
      const specifier = declaration.getModuleSpecifierValue();
      if (specifier === undefined) continue;
      statements.push({
        specifier,
        kind: "re-export",
        line: declaration.getStartLineNumber(),
        literal: true,
      });
    }

    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) continue;
      const argument = call.getArguments()[0];
      const line = call.getStartLineNumber();

      if (
        Node.isStringLiteral(argument) ||
        Node.isNoSubstitutionTemplateLiteral(argument)
      ) {
        statements.push({
          specifier: argument.getLiteralText(),
          kind: "dynamic-import",
          line,
          literal: true,
        });
        continue;
      }

      statements.push({
        specifier: "",
        kind: "dynamic-import",
        line,
        literal: false,
        argumentKind: argument?.getKindName() ?? "no argument",
      });
    }
  } finally {
    // The imports are extracted; holding the tree only costs memory.
    sourceFile.forget();
  }

  statements.sort((left, right) => left.line - right.line);
  return statements;
}

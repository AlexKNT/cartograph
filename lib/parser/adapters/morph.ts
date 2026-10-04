import { Project, type SourceFile } from "ts-morph";

/**
 * Adapters that read decorators need a parsed tree. The parser reads imports in
 * its own project; an adapter gets a second, small one so the two never share
 * state, and the tree is forgotten the moment the answer is out.
 */
const project = new Project({
  useInMemoryFileSystem: true,
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
});

export function withSourceFile<T>(
  path: string,
  text: string,
  read: (file: SourceFile) => T,
): T {
  const file = project.createSourceFile(`/${path}`, text, { overwrite: true });
  try {
    return read(file);
  } finally {
    file.forget();
  }
}

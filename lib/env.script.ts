/**
 * The environment a plain script runs in.
 *
 * Next loads `.env.local` for the app; a script started with `node` gets
 * nothing, which is why an eval would otherwise fail on a key that is sitting
 * right there in the file. Node's own reader is used rather than a package, and
 * it never overwrites a variable already in the environment, so a real value
 * always wins over the file.
 *
 * `.env.local` is read first because it does not override, which is the order
 * that lets the local file win over `.env` — the same precedence Next uses.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

export function loadScriptEnv(directory: string = process.cwd()): void {
  if (loaded) return;
  loaded = true;

  for (const name of [".env.local", ".env"]) {
    const path = resolve(directory, name);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

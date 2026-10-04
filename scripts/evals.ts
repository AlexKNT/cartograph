/**
 * The entry point for the checks. Environment first, then everything that reads
 * it: the eval modules build clients from `process.env` when they are imported,
 * so they are imported after the file is loaded rather than alongside it.
 */
import { loadScriptEnv } from "../lib/env.script.ts";

async function main(): Promise<void> {
  loadScriptEnv();
  const { runEvals } = await import("../lib/evals/cli.ts");
  await runEvals(process.argv.slice(2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

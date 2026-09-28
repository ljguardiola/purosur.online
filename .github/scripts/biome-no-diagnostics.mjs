import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const biomeBinary = join(dirname(fileURLToPath(import.meta.url)), "../../node_modules/.bin/biome");

export function runCli({ args = process.argv.slice(2), logError = console.error } = {}) {
  const reportDir = mkdtempSync(join(tmpdir(), "biome-no-diagnostics-"));
  try {
    const reportPath = join(reportDir, "report.sarif");
    const biome = spawnSync(
      biomeBinary,
      [...args, "--reporter=default", "--reporter=sarif", `--reporter-file=${reportPath}`],
      { stdio: "inherit" },
    );
    if (biome.status !== 0) return biome.status ?? 1;

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const diagnostics = report.runs.flatMap((run) => run.results).length;
    if (diagnostics === 0) return 0;

    logError(
      `biome-no-diagnostics: Biome reported ${diagnostics} diagnostic(s); verify fails on every level, info included.`,
    );
    return 1;
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  process.exit(runCli());
}

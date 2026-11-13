import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { measureDownload } from "./backoffice-download-budget.mjs";

const DEFAULT_DIST_DIR = "apps/backoffice/dist";

export function runMeasurementCli({
  distDir = DEFAULT_DIST_DIR,
  outPath,
  logError = console.error,
}) {
  if (outPath === undefined) {
    logError("dependabot-budget-measure: pass the output path to write the measurement to");
    return 1;
  }
  if (!existsSync(join(distDir, "index.html"))) {
    logError(
      `dependabot-budget-measure: ${join(distDir, "index.html")} does not exist; build the backoffice first`,
    );
    return 1;
  }
  const { entry, total, missing } = measureDownload(distDir);
  writeFileSync(outPath, JSON.stringify({ entry, total, missing }));
  return 0;
}

if (import.meta.main) {
  process.exit(runMeasurementCli({ outPath: process.argv[2] }));
}

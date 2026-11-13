import { writeFileSync } from "node:fs";
import { measureDownload } from "./backoffice-download-budget.mjs";

const DEFAULT_DIST_DIR = "apps/backoffice/dist";

export function writeMeasurement({ distDir = DEFAULT_DIST_DIR, outPath }) {
  const { entry, total, missing } = measureDownload(distDir);
  writeFileSync(outPath, JSON.stringify({ entry, total, missing }));
}

if (import.meta.main) {
  writeMeasurement({ outPath: process.argv[2] });
}

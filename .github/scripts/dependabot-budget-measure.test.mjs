import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { measureDownload } from "./backoffice-download-budget.mjs";
import { writeMeasurement } from "./dependabot-budget-measure.mjs";
import { readMeasurement } from "./dependabot-budget-raise.mjs";

test("writeMeasurement writes the build's measured sizes in the shape readMeasurement reads", async () => {
  const root = await mkdtemp(join(tmpdir(), "budget measurement "));
  try {
    const dist = join(root, "dist");
    await mkdir(join(dist, "assets"), { recursive: true });
    await writeFile(
      join(dist, "index.html"),
      '<script type="module" src="/assets/index.js"></script><link href="/assets/font.woff2">',
    );
    await writeFile(join(dist, "assets", "index.js"), "export const value = 1;\n");
    const outPath = join(root, "measurement.json");

    writeMeasurement({ distDir: dist, outPath });

    assert.deepEqual(readMeasurement(await readFile(outPath, "utf8")), measureDownload(dist));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

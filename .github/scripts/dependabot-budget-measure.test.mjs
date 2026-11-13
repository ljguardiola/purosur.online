import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { measureDownload } from "./backoffice-download-budget.mjs";
import { runMeasurementCli } from "./dependabot-budget-measure.mjs";
import { readMeasurement } from "./dependabot-budget-raise.mjs";

async function withRoot(run) {
  const root = await mkdtemp(join(tmpdir(), "budget measurement "));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function recordingErrors() {
  const errors = [];
  return { errors, logError: (line) => errors.push(line) };
}

test("runMeasurementCli writes the build's measured sizes in the shape readMeasurement reads", async () => {
  await withRoot(async (root) => {
    const dist = join(root, "dist");
    await mkdir(join(dist, "assets"), { recursive: true });
    await writeFile(
      join(dist, "index.html"),
      '<script type="module" src="/assets/index.js"></script><link href="/assets/font.woff2">',
    );
    await writeFile(join(dist, "assets", "index.js"), "export const value = 1;\n");
    const outPath = join(root, "measurement.json");
    const { logError } = recordingErrors();

    const exitCode = runMeasurementCli({ distDir: dist, outPath, logError });

    assert.equal(exitCode, 0);
    assert.deepEqual(readMeasurement(await readFile(outPath, "utf8")), measureDownload(dist));
  });
});

test("runMeasurementCli exits 1 and names its missing argument when given no output path", () => {
  const { errors, logError } = recordingErrors();

  const exitCode = runMeasurementCli({ distDir: "unused", outPath: undefined, logError });

  assert.equal(exitCode, 1);
  assert.match(errors.join("\n"), /output path/);
});

test("runMeasurementCli exits 1 and writes nothing when there is no build to measure", async () => {
  await withRoot(async (root) => {
    const outPath = join(root, "measurement.json");
    const { errors, logError } = recordingErrors();

    const exitCode = runMeasurementCli({ distDir: join(root, "dist"), outPath, logError });

    assert.equal(exitCode, 1);
    assert.match(errors.join("\n"), /build the backoffice first/);
    assert.equal(existsSync(outPath), false);
  });
});

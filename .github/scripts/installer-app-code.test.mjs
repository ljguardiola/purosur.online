import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { extractAppCode, runCli } from "./installer-app-code.mjs";

const INSTALLER_NAME = "Puro Sur Setup 0.0.57.exe";
const APP_CODE = "fictional app code";

async function withDirs(run) {
  const dir = await mkdtemp(join(tmpdir(), "installer-app-code-"));
  const installerDir = join(dir, "installer");
  await mkdir(installerDir);
  await writeFile(join(installerDir, INSTALLER_NAME), "fictional installer");
  try {
    return await run({ installerDir, outputDir: join(dir, "extracted") });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeInto(directory, path, text) {
  await mkdir(dirname(join(directory, path)), { recursive: true });
  await writeFile(join(directory, path), text);
}

function nsisExtractor({ appArchive = "$PLUGINSDIR/app-64.7z", appCode = "resources/app.asar" }) {
  const extracted = [];
  return {
    extracted,
    extract: async (archive, outputDir) => {
      extracted.push({ archive, outputDir });
      if (archive.endsWith(".exe")) {
        await writeInto(outputDir, appArchive, "inner archive");
      } else if (archive.endsWith("app-64.7z")) {
        await writeInto(outputDir, appCode, APP_CODE);
      }
    },
  };
}

test("extracts the app code from the app archive inside the installer", async () => {
  await withDirs(async ({ installerDir, outputDir }) => {
    const extractor = nsisExtractor({});

    const appAsar = await extractAppCode({ installerDir, outputDir, extract: extractor.extract });

    assert.equal(await readFile(appAsar, "utf8"), APP_CODE);
    assert.equal(extractor.extracted[0].archive, join(installerDir, INSTALLER_NAME));
    assert.equal(
      extractor.extracted[1].archive,
      join(extractor.extracted[0].outputDir, "$PLUGINSDIR", "app-64.7z"),
    );
    assert.equal(extractor.extracted.length, 2);
  });
});

test("refuses an installer that holds no app archive", async () => {
  await withDirs(async ({ installerDir, outputDir }) => {
    const extractor = nsisExtractor({ appArchive: "$PLUGINSDIR/app-32.7z" });

    await assert.rejects(
      extractAppCode({ installerDir, outputDir, extract: extractor.extract }),
      /app-64\.7z/,
    );
  });
});

test("refuses an app archive that holds no app.asar", async () => {
  await withDirs(async ({ installerDir, outputDir }) => {
    const extractor = nsisExtractor({ appCode: "resources/other.asar" });

    await assert.rejects(
      extractAppCode({ installerDir, outputDir, extract: extractor.extract }),
      /app\.asar/,
    );
  });
});

test("refuses a directory that does not hold exactly one installer", async () => {
  await withDirs(async ({ installerDir, outputDir }) => {
    await writeFile(join(installerDir, "Another Setup.exe"), "x");

    await assert.rejects(
      extractAppCode({ installerDir, outputDir, extract: nsisExtractor({}).extract }),
      /exactly one installer/,
    );
  });
});

function cliHarness(env, extract) {
  const outputs = [];
  const errors = [];
  return {
    outputs,
    errors,
    options: {
      env: { GITHUB_OUTPUT: "out", ...env },
      extract,
      appendOutput: async (_path, text) => outputs.push(text),
      log: () => {},
      logError: (message) => errors.push(message),
    },
  };
}

test("the CLI outputs where the extracted app code is", async () => {
  await withDirs(async ({ installerDir, outputDir }) => {
    const harness = cliHarness(
      { INSTALLER_DIR: installerDir, OUTPUT_DIR: outputDir },
      nsisExtractor({}).extract,
    );

    assert.equal(await runCli(harness.options), 0);
    const [output] = harness.outputs;
    assert.match(output, /^app_asar=.+\n$/);
    assert.equal(await readFile(output.slice("app_asar=".length, -1), "utf8"), APP_CODE);
  });
});

test("the CLI refuses an installer it cannot extract the app code from", async () => {
  await withDirs(async ({ installerDir, outputDir }) => {
    const harness = cliHarness({ INSTALLER_DIR: installerDir, OUTPUT_DIR: outputDir }, async () => {
      throw new Error("7z failed");
    });

    assert.equal(await runCli(harness.options), 1);
    assert.match(harness.errors.join("\n"), /7z failed/);
    assert.deepEqual(harness.outputs, []);
  });
});

test("the CLI names what is missing", async () => {
  const harness = cliHarness({ GITHUB_OUTPUT: "" }, nsisExtractor({}).extract);

  assert.equal(await runCli(harness.options), 1);
  const output = harness.errors.join("\n");
  assert.match(output, /INSTALLER_DIR/);
  assert.match(output, /OUTPUT_DIR/);
  assert.match(output, /GITHUB_OUTPUT/);
});

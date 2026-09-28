import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import {
  findBudgetViolations,
  gzipSizeOf,
  localFilesReferencedBy,
  measureDownload,
  runCli,
} from "./backoffice-download-budget.mjs";

const INDEX_HTML = [
  "<!doctype html>",
  "<html>",
  "  <head>",
  '    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
  '    <link rel="stylesheet" crossorigin href="/assets/index-abc.css">',
  '    <script type="module" crossorigin src="/assets/index-abc.js"></script>',
  "  </head>",
  '  <body><div id="root"></div></body>',
  "</html>",
].join("\n");

const compressibleText = (seed) => `${seed}:${"abcdefgh".repeat(400)}`;

async function withDist(files, run) {
  const root = await mkdtemp(join(tmpdir(), "download budget "));
  try {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, "dist", path)), { recursive: true });
      await writeFile(join(root, "dist", path), content);
    }
    await run({ root, dist: join(root, "dist"), budgetPath: join(root, "budget.json") });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const builtFiles = {
  "index.html": INDEX_HTML,
  "favicon.svg": compressibleText("favicon"),
  "assets/index-abc.css": compressibleText("css"),
  "assets/index-abc.js": compressibleText("js"),
  "assets/settings-def.js": compressibleText("lazy"),
};

test("gzipSizeOf is the size of the gzip-compressed content", () => {
  const content = Buffer.from(compressibleText("x"));

  assert.equal(gzipSizeOf(content), gzipSync(content).length);
});

test("localFilesReferencedBy lists the local files index.html points to, without their leading slash", () => {
  assert.deepEqual(localFilesReferencedBy(INDEX_HTML), [
    "favicon.svg",
    "assets/index-abc.css",
    "assets/index-abc.js",
  ]);
});

test("localFilesReferencedBy ignores remote addresses, data URIs and query strings", () => {
  const html = [
    '<link rel="preconnect" href="https://fonts.example.com">',
    '<link rel="icon" href="//cdn.example.com/icon.svg">',
    '<link rel="icon" href="data:image/png;base64,AAAA">',
    '<script src="/assets/app.js?v=3#top"></script>',
  ].join("\n");

  assert.deepEqual(localFilesReferencedBy(html), ["assets/app.js"]);
});

test("localFilesReferencedBy lists a file index.html references more than once only once", () => {
  const html = [
    '<link rel="modulepreload" href="/assets/app.js">',
    '<script type="module" src="/assets/app.js"></script>',
  ].join("\n");

  assert.deepEqual(localFilesReferencedBy(html), ["assets/app.js"]);
});

test("measureDownload counts index.html and every file it references for the entry, and every file for the total", async () => {
  await withDist(builtFiles, async ({ dist }) => {
    const measured = measureDownload(dist);

    const size = (path) => gzipSizeOf(Buffer.from(builtFiles[path]));
    assert.equal(
      measured.entry,
      size("index.html") +
        size("favicon.svg") +
        size("assets/index-abc.css") +
        size("assets/index-abc.js"),
    );
    assert.equal(measured.total, measured.entry + size("assets/settings-def.js"));
    assert.deepEqual(measured.missing, []);
  });
});

test("measureDownload reports a referenced file that the build did not produce", async () => {
  const { "assets/index-abc.js": _script, ...withoutScript } = builtFiles;

  await withDist(withoutScript, async ({ dist }) => {
    assert.deepEqual(measureDownload(dist).missing, ["assets/index-abc.js"]);
  });
});

test("findBudgetViolations is empty while both sizes are within their budgets", () => {
  const violations = findBudgetViolations(
    { entry: 100, total: 300, missing: [] },
    { entry: 100, total: 300 },
  );

  assert.deepEqual(violations, []);
});

test("findBudgetViolations names the measure that is over budget", () => {
  const violations = findBudgetViolations(
    { entry: 101, total: 300, missing: [] },
    { entry: 100, total: 300 },
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0], /entry/);
  assert.match(violations[0], /101/);
  assert.match(violations[0], /100/);
});

test("findBudgetViolations names a file that index.html references and the build lacks", () => {
  const violations = findBudgetViolations(
    { entry: 1, total: 1, missing: ["assets/font.woff2"] },
    { entry: 100, total: 300 },
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0], /assets\/font\.woff2/);
});

for (const [description, budget] of [
  ["lacks a measure", { total: 300 }],
  ["misspells a measure", { entri: 100, total: 300 }],
  ["holds an unknown measure", { entry: 100, total: 300, fonts: 50 }],
  ["holds a measure that is not a number", { entry: "100", total: 300 }],
  ["holds a measure that is not an integer", { entry: 100.5, total: 300 }],
  ["holds a measure that is not positive", { entry: 0, total: 300 }],
  ["is not an object", [100, 300]],
]) {
  test(`findBudgetViolations rejects a budget that ${description}`, () => {
    const violations = findBudgetViolations({ entry: 1, total: 1, missing: [] }, budget);

    assert.equal(violations.length, 1);
    assert.match(violations[0], /entry/);
    assert.match(violations[0], /total/);
  });
}

function recordingLogs() {
  const lines = { out: [], err: [] };
  return {
    lines,
    log: (line) => lines.out.push(line),
    logError: (line) => lines.err.push(line),
  };
}

test("runCli exits 0 and prints the measured sizes against the budget when within budget", async () => {
  await withDist(builtFiles, async ({ dist, budgetPath }) => {
    await writeFile(budgetPath, JSON.stringify({ entry: 10_000, total: 20_000 }));
    const { lines, log, logError } = recordingLogs();

    const exitCode = runCli({ distDir: dist, budgetPath, log, logError });

    assert.equal(exitCode, 0);
    assert.equal(lines.err.length, 0);
    assert.match(lines.out.join("\n"), /entry: \d+ \/ 10000 bytes gzip/);
    assert.match(lines.out.join("\n"), /total: \d+ \/ 20000 bytes gzip/);
  });
});

test("runCli exits 1 and explains when the entry is over budget", async () => {
  await withDist(builtFiles, async ({ dist, budgetPath }) => {
    await writeFile(budgetPath, JSON.stringify({ entry: 1, total: 20_000 }));
    const { lines, log, logError } = recordingLogs();

    const exitCode = runCli({ distDir: dist, budgetPath, log, logError });

    assert.equal(exitCode, 1);
    assert.match(lines.err.join("\n"), /entry/);
  });
});

test("runCli exits 1 when index.html references a file the build lacks", async () => {
  const { "assets/index-abc.css": _css, ...withoutCss } = builtFiles;

  await withDist(withoutCss, async ({ dist, budgetPath }) => {
    await writeFile(budgetPath, JSON.stringify({ entry: 10_000, total: 20_000 }));
    const { lines, log, logError } = recordingLogs();

    const exitCode = runCli({ distDir: dist, budgetPath, log, logError });

    assert.equal(exitCode, 1);
    assert.match(lines.err.join("\n"), /assets\/index-abc\.css/);
  });
});

test("runCli exits 1 when the budget does not hold every measure", async () => {
  await withDist(builtFiles, async ({ dist, budgetPath }) => {
    await writeFile(budgetPath, JSON.stringify({ firstScreen: 10_000, total: 20_000 }));
    const { lines, log, logError } = recordingLogs();

    const exitCode = runCli({ distDir: dist, budgetPath, log, logError });

    assert.equal(exitCode, 1);
    assert.match(lines.err.join("\n"), /entry/);
  });
});

for (const [description, budget] of [
  ["holds null", null],
  ["lacks the entry", { total: 20_000 }],
]) {
  test(`runCli exits 1 with the budget's expected shape and prints no sizes when the budget ${description}`, async () => {
    await withDist(builtFiles, async ({ dist, budgetPath }) => {
      await writeFile(budgetPath, JSON.stringify(budget));
      const { lines, log, logError } = recordingLogs();

      const exitCode = runCli({ distDir: dist, budgetPath, log, logError });

      assert.equal(exitCode, 1);
      assert.match(lines.err.join("\n"), /must hold exactly entry and total/);
      assert.deepEqual(lines.out, []);
    });
  });
}

test("runCli exits 1 when there is no build to measure", async () => {
  await withDist({}, async ({ root, budgetPath }) => {
    await writeFile(budgetPath, JSON.stringify({ entry: 10_000, total: 20_000 }));
    const { lines, log, logError } = recordingLogs();

    const exitCode = runCli({ distDir: join(root, "dist"), budgetPath, log, logError });

    assert.equal(exitCode, 1);
    assert.match(lines.err.join("\n"), /index\.html/);
  });
});

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

test("measureDownload counts index.html and what it references for the first screen, and every file for the total", async () => {
  await withDist(builtFiles, async ({ dist }) => {
    const measured = measureDownload(dist);

    const size = (path) => gzipSizeOf(Buffer.from(builtFiles[path]));
    assert.equal(
      measured.firstScreen,
      size("index.html") +
        size("favicon.svg") +
        size("assets/index-abc.css") +
        size("assets/index-abc.js"),
    );
    assert.equal(measured.total, measured.firstScreen + size("assets/settings-def.js"));
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
    { firstScreen: 100, total: 300, missing: [] },
    { firstScreen: 100, total: 300 },
  );

  assert.deepEqual(violations, []);
});

test("findBudgetViolations names the measure that is over budget", () => {
  const violations = findBudgetViolations(
    { firstScreen: 101, total: 300, missing: [] },
    { firstScreen: 100, total: 300 },
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0], /firstScreen/);
  assert.match(violations[0], /101/);
  assert.match(violations[0], /100/);
});

test("findBudgetViolations names a file that index.html references and the build lacks", () => {
  const violations = findBudgetViolations(
    { firstScreen: 1, total: 1, missing: ["assets/font.woff2"] },
    { firstScreen: 100, total: 300 },
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0], /assets\/font\.woff2/);
});

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
    await writeFile(budgetPath, JSON.stringify({ firstScreen: 10_000, total: 20_000 }));
    const { lines, log, logError } = recordingLogs();

    const exitCode = runCli({ distDir: dist, budgetPath, log, logError });

    assert.equal(exitCode, 0);
    assert.equal(lines.err.length, 0);
    assert.match(lines.out.join("\n"), /firstScreen: \d+ \/ 10000 bytes gzip/);
    assert.match(lines.out.join("\n"), /total: \d+ \/ 20000 bytes gzip/);
  });
});

test("runCli exits 1 and explains when the first screen is over budget", async () => {
  await withDist(builtFiles, async ({ dist, budgetPath }) => {
    await writeFile(budgetPath, JSON.stringify({ firstScreen: 1, total: 20_000 }));
    const { lines, log, logError } = recordingLogs();

    const exitCode = runCli({ distDir: dist, budgetPath, log, logError });

    assert.equal(exitCode, 1);
    assert.match(lines.err.join("\n"), /firstScreen/);
  });
});

test("runCli exits 1 when index.html references a file the build lacks", async () => {
  const { "assets/index-abc.css": _css, ...withoutCss } = builtFiles;

  await withDist(withoutCss, async ({ dist, budgetPath }) => {
    await writeFile(budgetPath, JSON.stringify({ firstScreen: 10_000, total: 20_000 }));
    const { lines, log, logError } = recordingLogs();

    const exitCode = runCli({ distDir: dist, budgetPath, log, logError });

    assert.equal(exitCode, 1);
    assert.match(lines.err.join("\n"), /assets\/index-abc\.css/);
  });
});

test("runCli exits 1 when there is no build to measure", async () => {
  await withDist({}, async ({ root, budgetPath }) => {
    await writeFile(budgetPath, JSON.stringify({ firstScreen: 10_000, total: 20_000 }));
    const { lines, log, logError } = recordingLogs();

    const exitCode = runCli({ distDir: join(root, "dist"), budgetPath, log, logError });

    assert.equal(exitCode, 1);
    assert.match(lines.err.join("\n"), /index\.html/);
  });
});

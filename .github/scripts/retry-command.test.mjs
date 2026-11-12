import assert from "node:assert/strict";
import { test } from "node:test";
import { RETRY_DELAYS_SECONDS, runCli, runInheritingOutput } from "./retry-command.mjs";

const ARGV = [
  "--title",
  "Install age",
  "--failure",
  "age could not be installed",
  "--",
  "apt-get",
  "install",
  "age",
];

async function cli({ argv = ARGV, exitCodes = [] } = {}) {
  const runs = [];
  const waits = [];
  const lines = [];
  const exitCode = await runCli({
    argv,
    run: async (command, args) => {
      runs.push([command, ...args]);
      return exitCodes[runs.length - 1] ?? 1;
    },
    sleep: async (seconds) => {
      waits.push(seconds);
    },
    log: (line) => lines.push(line),
  });
  return { exitCode, runs, waits, lines };
}

test("runs the command once and succeeds when its first attempt succeeds", async () => {
  const { exitCode, runs, waits } = await cli({ exitCodes: [0] });

  assert.equal(exitCode, 0);
  assert.deepEqual(runs, [["apt-get", "install", "age"]]);
  assert.deepEqual(waits, []);
});

test("waits and runs the command again after a failed attempt, succeeding once one does", async () => {
  const { exitCode, runs, waits, lines } = await cli({ exitCodes: [100, 100, 0] });

  assert.equal(exitCode, 0);
  assert.equal(runs.length, 3);
  assert.deepEqual(waits, RETRY_DELAYS_SECONDS.slice(0, 2));
  assert.ok(lines.every((line) => !line.startsWith("::error")));
});

test("waits longer before each next attempt", () => {
  for (let i = 1; i < RETRY_DELAYS_SECONDS.length; i++) {
    assert.ok(RETRY_DELAYS_SECONDS[i] > RETRY_DELAYS_SECONDS[i - 1]);
  }
});

test("gives up and fails once every attempt has failed", async () => {
  const { exitCode, runs, waits } = await cli();

  assert.equal(exitCode, 1);
  assert.equal(runs.length, RETRY_DELAYS_SECONDS.length + 1);
  assert.deepEqual(waits, RETRY_DELAYS_SECONDS);
});

test("names each failed attempt in the log", async () => {
  const { lines } = await cli({ exitCodes: [100, 0] });

  assert.ok(
    lines.some((line) =>
      line.includes(`Install age failed (attempt 1/${RETRY_DELAYS_SECONDS.length + 1})`),
    ),
  );
});

test("when it gives up, raises an error annotation titled with the step and its failure", async () => {
  const { lines } = await cli();

  assert.equal(
    lines.at(-1),
    `::error title=Install age::age could not be installed after ${RETRY_DELAYS_SECONDS.length + 1} attempts`,
  );
});

test("escapes what the annotation's title and message cannot hold", async () => {
  const { lines } = await cli({
    argv: ["--title", "Fetch: a, b", "--failure", "100% gone\nfor now", "--", "false"],
  });

  assert.match(
    lines.at(-1),
    /^::error title=Fetch%3A a%2C b::100%25 gone%0Afor now after \d+ attempts$/,
  );
});

for (const argv of [
  [],
  ["--title", "Install age", "--failure", "age could not be installed"],
  ["--title", "Install age", "--", "apt-get"],
  ["--failure", "age could not be installed", "--", "apt-get"],
  ["--title", "", "--failure", "age could not be installed", "--", "apt-get"],
  [
    "--title",
    "Install age",
    "--failure",
    "age could not be installed",
    "--colour",
    "--",
    "apt-get",
  ],
]) {
  test(`refuses ${JSON.stringify(argv)} without running anything`, async () => {
    const { exitCode, runs, lines } = await cli({ argv });

    assert.equal(exitCode, 1);
    assert.deepEqual(runs, []);
    assert.match(
      lines.join("\n"),
      /usage: retry-command\.mjs --title <step> --failure <message> -- <command>/,
    );
  });
}

test("runs a real command with its arguments and answers its exit status", async () => {
  assert.equal(await runInheritingOutput(process.execPath, ["-e", "process.exit(3)"]), 3);
  assert.equal(await runInheritingOutput(process.execPath, ["-e", "process.exit(0)"]), 0);
});

test("answers a failure for a command that cannot be started", async () => {
  assert.notEqual(await runInheritingOutput("/nonexistent/retry-command/age", []), 0);
});

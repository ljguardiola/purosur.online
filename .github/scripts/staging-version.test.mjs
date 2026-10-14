import assert from "node:assert/strict";
import { test } from "node:test";
import { runCli } from "./staging-version.mjs";

const SHA = "c".repeat(40);

function fakeCli({ version, status = 200, env = {} }) {
  const calls = { outputs: [], errors: [], urls: [] };
  return {
    calls,
    run: () =>
      runCli({
        env: { CLOUD_HEALTH_DOMAIN: "staging.example.test", GITHUB_OUTPUT: "/output", ...env },
        fetchImpl: async (url) => {
          calls.urls.push(url);
          return { status, json: async () => ({ status: "ok", version }) };
        },
        appendOutput: async (path, text) => calls.outputs.push({ path, text }),
        log: () => {},
        logError: (message) => calls.errors.push(message),
      }),
  };
}

test("writes the commit the staging domain serves", async () => {
  const { run, calls } = fakeCli({ version: SHA });

  assert.equal(await run(), 0);
  assert.deepEqual(calls.urls, ["https://staging.example.test/api/health"]);
  assert.deepEqual(calls.outputs, [{ path: "/output", text: `sha=${SHA}\n` }]);
});

test("refuses a version that is not a commit SHA", async () => {
  for (const version of ["dev", "abc123", `${SHA}0`, undefined]) {
    const { run, calls } = fakeCli({ version });
    assert.equal(await run(), 1, String(version));
    assert.deepEqual(calls.outputs, []);
    assert.match(calls.errors.join("\n"), /commit SHA/);
  }
});

test("refuses when the health answer is an error", async () => {
  const { run } = fakeCli({ version: SHA, status: 503 });

  assert.equal(await run(), 1);
});

test("fails without its inputs", async () => {
  assert.equal(await fakeCli({ version: SHA, env: { CLOUD_HEALTH_DOMAIN: "" } }).run(), 1);
  assert.equal(await fakeCli({ version: SHA, env: { GITHUB_OUTPUT: "" } }).run(), 1);
});

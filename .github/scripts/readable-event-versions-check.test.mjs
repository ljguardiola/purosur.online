import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchReadableVersions,
  runCli,
  unreadableVersions,
} from "./readable-event-versions-check.mjs";

const ORIGIN = "https://production.example.test";
const TOKEN = "fictional-release-check-token-0123456789";

function answer(status, body) {
  return async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

test("lists the emitted versions the cloud cannot read, sorted", () => {
  assert.deepEqual(
    unreadableVersions({
      emitted: ["sale@2", "stock@1", "cash@3", "sale@1"],
      readable: ["sale@1", "stock@1"],
    }),
    ["cash@3", "sale@2"],
  );
});

test("lists nothing when every emitted version is readable", () => {
  assert.deepEqual(unreadableVersions({ emitted: ["sale@1"], readable: ["sale@1", "sale@2"] }), []);
});

test("reads the versions the production cloud reads, asking with the release check token", async () => {
  const requests = [];

  const versions = await fetchReadableVersions({
    origin: ORIGIN,
    token: TOKEN,
    fetchImpl: async (url, init) => {
      requests.push({ url, authorization: init.headers.Authorization });
      return new Response(JSON.stringify({ event_versions: ["sale@1", "stock@1"] }));
    },
  });

  assert.deepEqual(versions, ["sale@1", "stock@1"]);
  assert.deepEqual(requests, [
    { url: `${ORIGIN}/api/sync/readable-event-versions`, authorization: `Bearer ${TOKEN}` },
  ]);
});

test("refuses an answer that is not a 200 with a list of event versions", async () => {
  for (const [status, body, message] of [
    [401, {}, /401/],
    [500, {}, /500/],
    [200, "not json", /malformed/],
    [200, {}, /malformed/],
    [200, { event_versions: "sale@1" }, /malformed/],
    [200, { event_versions: [1] }, /malformed/],
    [200, { event_versions: ["sale"] }, /malformed/],
    [200, { event_versions: ["sale@0"] }, /malformed/],
    [200, { event_versions: ["Sale@1"] }, /malformed/],
  ]) {
    await assert.rejects(
      fetchReadableVersions({ origin: ORIGIN, token: TOKEN, fetchImpl: answer(status, body) }),
      message,
    );
  }
});

test("refuses when the request itself fails", async () => {
  await assert.rejects(
    fetchReadableVersions({
      origin: ORIGIN,
      token: TOKEN,
      fetchImpl: async () => {
        throw new Error("connection refused");
      },
    }),
    /connection refused/,
  );
});

function cliHarness({ env = {}, emitted = ["sale@1"], fetchImpl, readFile } = {}) {
  const logs = [];
  const errors = [];
  return {
    logs,
    errors,
    options: {
      env: {
        PRODUCTION_ORIGIN: ORIGIN,
        RELEASE_CHECK_TOKEN: TOKEN,
        EMITTED_EVENT_VERSIONS_FILE: "emitted.json",
        ...env,
      },
      readFile: readFile ?? (async () => JSON.stringify(emitted)),
      fetchImpl: fetchImpl ?? answer(200, { event_versions: ["sale@1", "stock@1"] }),
      log: (message) => logs.push(message),
      logError: (message) => errors.push(message),
    },
  };
}

test("the CLI accepts a register that emits only versions production reads", async () => {
  const harness = cliHarness({ emitted: ["sale@1", "stock@1"] });

  assert.equal(await runCli(harness.options), 0);
});

test("the CLI refuses, naming each version production cannot read", async () => {
  const harness = cliHarness({ emitted: ["sale@1", "sale@2", "cash@1"] });

  assert.equal(await runCli(harness.options), 1);
  const output = harness.errors.join("\n");
  assert.match(output, /cash@1/);
  assert.match(output, /sale@2/);
  assert.doesNotMatch(output, /sale@1\b/);
});

test("the CLI refuses when production's answer is unusable", async () => {
  const harness = cliHarness({ fetchImpl: answer(503, {}) });

  assert.equal(await runCli(harness.options), 1);
  assert.match(harness.errors.join("\n"), /503/);
});

test("the CLI refuses an emitted list that is not event versions", async () => {
  for (const emitted of [
    {},
    "sale@1",
    [1],
    ["sale"],
    ["sale@x"],
    ["@1"],
    [],
    ["sale@0"],
    ["sale@01"],
    ["Sale@1"],
    ["sale-completed@1"],
  ]) {
    const harness = cliHarness({ emitted });

    assert.equal(await runCli(harness.options), 1, JSON.stringify(emitted));
    assert.match(harness.errors.join("\n"), /emitted/);
  }
});

test("the CLI refuses an emitted list that cannot be read", async () => {
  const harness = cliHarness({
    readFile: async () => {
      throw new Error("no such file");
    },
  });

  assert.equal(await runCli(harness.options), 1);
  assert.match(harness.errors.join("\n"), /no such file/);
});

test("the CLI names what is missing and never prints the token", async () => {
  const harness = cliHarness({ env: { RELEASE_CHECK_TOKEN: "", PRODUCTION_ORIGIN: "" } });

  assert.equal(await runCli(harness.options), 1);
  const output = harness.errors.join("\n");
  assert.match(output, /PRODUCTION_ORIGIN/);
  assert.match(output, /RELEASE_CHECK_TOKEN/);
  assert.doesNotMatch(output, new RegExp(TOKEN));
});

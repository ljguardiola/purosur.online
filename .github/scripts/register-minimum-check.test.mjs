import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  loadRegisterVersionModule,
  minimumIsRaised,
  readMinimumVersion,
  registersBelowMinimum,
  runCli,
} from "./register-minimum-check.mjs";

const NEW_SHA = "a".repeat(40);
const OLD_SHA = "b".repeat(40);
const MODULE_PATH = "packages/domain/src/sync/model/register-version.ts";

function moduleSource(minimum) {
  return `export const MINIMUM_ACCEPTED_REGISTER_VERSION = "${minimum}";
export function versionAtLeast(version: string, minimum: string): boolean {
  const parse = (value: string) => value.split(".").map(Number);
  const [a, b] = [parse(version), parse(minimum)];
  for (const [index, part] of a.entries()) {
    if (part !== b[index]) return part > (b[index] ?? 0);
  }
  return true;
}
`;
}

test("loads the domain's own register version module straight from its source", async () => {
  const source = readFileSync(new URL(`../../${MODULE_PATH}`, import.meta.url), "utf8");

  const loaded = await loadRegisterVersionModule(source);

  assert.equal(typeof loaded.MINIMUM_ACCEPTED_REGISTER_VERSION, "string");
  assert.equal(loaded.versionAtLeast("1.2.3", "1.2.0"), true);
  assert.equal(loaded.versionAtLeast("1.1.9", "1.2.0"), false);
});

test("reads the minimum version a commit's module declares", async () => {
  const runGit = async (args) => {
    assert.deepEqual(args, ["show", `${NEW_SHA}:${MODULE_PATH}`]);
    return moduleSource("2.0.0");
  };

  const result = await readMinimumVersion({
    sha: NEW_SHA,
    runGit,
    loadModule: loadRegisterVersionModule,
  });

  assert.equal(result.minimum, "2.0.0");
  assert.equal(typeof result.versionAtLeast, "function");
});

test("refuses a module that declares no minimum", async () => {
  await assert.rejects(
    readMinimumVersion({
      sha: NEW_SHA,
      runGit: async () => "export const other = 1;\n",
      loadModule: loadRegisterVersionModule,
    }),
    /MINIMUM_ACCEPTED_REGISTER_VERSION/,
  );
});

test("the minimum is raised only when the new one is above the previous one", () => {
  const versionAtLeast = (a, b) => a.localeCompare(b, "en", { numeric: true }) >= 0;
  assert.equal(minimumIsRaised({ current: "1.1.0", previous: "1.0.0", versionAtLeast }), true);
  assert.equal(minimumIsRaised({ current: "1.0.0", previous: "1.0.0", versionAtLeast }), false);
  assert.equal(minimumIsRaised({ current: "1.0.0", previous: "1.1.0", versionAtLeast }), false);
});

function jsonResponse(body, status = 200) {
  return { ok: status === 200, status, json: async () => body };
}

function fakeFetch(response) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

const QUERY = { origin: "https://prod.example.test", minimum: "1.2.0", token: "release-token" };

test("asks the production origin for the registers below the minimum, with the release check token", async () => {
  const { fetchImpl, calls } = fakeFetch(jsonResponse({ registers: [] }));

  await registersBelowMinimum({ ...QUERY, fetchImpl });

  assert.equal(
    calls[0].url,
    "https://prod.example.test/api/sync/registers-below-minimum?minimum=1.2.0",
  );
  assert.equal(calls[0].options.headers.Authorization, "Bearer release-token");
  assert.equal(calls[0].options.headers["x-edge-origin-secret"], undefined);
});

test("encodes the minimum in the query", async () => {
  const { fetchImpl, calls } = fakeFetch(jsonResponse({ registers: [] }));

  await registersBelowMinimum({ ...QUERY, minimum: "1.2.0+a b", fetchImpl });

  assert.match(calls[0].url, /minimum=1\.2\.0%2Ba%20b$/);
});

test("returns the registers the cloud lists", async () => {
  const registers = [
    { register_name: "Caja 1", app_version: "1.0.0" },
    { register_name: "Caja 2", app_version: null },
  ];
  const { fetchImpl } = fakeFetch(jsonResponse({ registers }));

  assert.deepEqual(await registersBelowMinimum({ ...QUERY, fetchImpl }), registers);
});

test("refuses a failed request, a non-200 answer and a malformed body", async () => {
  const bad = [
    new Error("network down"),
    jsonResponse({}, 401),
    jsonResponse({}, 500),
    jsonResponse(null),
    jsonResponse([]),
    jsonResponse({}),
    jsonResponse({ registers: "none" }),
    jsonResponse({ registers: [{ app_version: "1.0.0" }] }),
    jsonResponse({ registers: [{ register_name: "Caja", app_version: 1 }] }),
    jsonResponse({ registers: [{ register_name: "Caja" }] }),
    jsonResponse({ registers: [null] }),
  ];
  for (const response of bad) {
    const { fetchImpl } = fakeFetch(response);
    await assert.rejects(registersBelowMinimum({ ...QUERY, fetchImpl }), /registers-below-minimum/);
  }
});

function sourcesByCommit({ current, previous }) {
  return async (args) => {
    if (args[1] === `${NEW_SHA}:${MODULE_PATH}`) return moduleSource(current);
    if (args[1] === `${OLD_SHA}:${MODULE_PATH}`) return moduleSource(previous);
    throw new Error(`unexpected git ${args.join(" ")}`);
  };
}

function cli({ env = {}, versions = { current: "1.2.0", previous: "1.0.0" }, response }) {
  const calls = { logs: [], errors: [], fetches: [] };
  const { fetchImpl, calls: fetchCalls } = fakeFetch(response ?? jsonResponse({ registers: [] }));
  const runGit = async (args) => {
    if (args[0] === "rev-parse") return `${OLD_SHA}\n`;
    return sourcesByCommit(versions)(args);
  };
  return {
    calls,
    fetchCalls,
    run: () =>
      runCli({
        env: {
          TARGET_SHA: NEW_SHA,
          PREVIOUS_TAG: "cloud-v1.0.0",
          PRODUCTION_ORIGIN: "https://prod.example.test",
          RELEASE_CHECK_TOKEN: "release-token",
          ...env,
        },
        runGit,
        fetchImpl,
        log: (message) => calls.logs.push(message),
        logError: (message) => calls.errors.push(message),
      }),
  };
}

test("passes without asking production when there is no previous release", async () => {
  const { run, calls, fetchCalls } = cli({ env: { PREVIOUS_TAG: "" } });

  assert.equal(await run(), 0);
  assert.equal(fetchCalls.length, 0);
  assert.match(calls.logs.join("\n"), /no previous release/);
});

test("passes without asking production when the minimum is not raised", async () => {
  const { run, calls, fetchCalls } = cli({ versions: { current: "1.0.0", previous: "1.0.0" } });

  assert.equal(await run(), 0);
  assert.equal(fetchCalls.length, 0);
  assert.match(calls.logs.join("\n"), /not raised/);
});

test("passes when the minimum is raised and no register is below it", async () => {
  const { run, fetchCalls } = cli({});

  assert.equal(await run(), 0);
  assert.equal(fetchCalls.length, 1);
});

test("refuses when the minimum is raised and registers are below it, naming each one", async () => {
  const { run, calls } = cli({
    response: jsonResponse({
      registers: [
        { register_name: "Caja 1", app_version: "1.0.0" },
        { register_name: "Caja 2", app_version: null },
      ],
    }),
  });

  assert.equal(await run(), 1);
  const errors = calls.errors.join("\n");
  assert.match(errors, /Caja 1.*1\.0\.0/);
  assert.match(errors, /Caja 2.*never reported/);
});

test("refuses when production cannot answer", async () => {
  const { run, calls } = cli({ response: jsonResponse({}, 500) });

  assert.equal(await run(), 1);
  assert.match(calls.errors.join("\n"), /registers-below-minimum/);
});

test("refuses when a raised minimum has no token to ask with", async () => {
  const { run, fetchCalls } = cli({ env: { RELEASE_CHECK_TOKEN: "" } });

  assert.equal(await run(), 1);
  assert.equal(fetchCalls.length, 0);
});

test("fails without its inputs", async () => {
  for (const missing of ["TARGET_SHA", "PRODUCTION_ORIGIN"]) {
    const { run } = cli({ env: { [missing]: "" } });
    assert.equal(await run(), 1, missing);
  }
});

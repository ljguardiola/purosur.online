import assert from "node:assert/strict";
import { test } from "node:test";
import { actorIsAdmin, runCli } from "./actor-is-admin.mjs";

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fakeFetch(response) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (response instanceof Error) throw response;
    return response;
  };
  return { fetchImpl, calls };
}

const INPUT = { repository: "owner/repo", actor: "some-user", token: "token" };

test("asks the collaborator permission endpoint with the token", async () => {
  const { fetchImpl, calls } = fakeFetch(jsonResponse({ permission: "admin" }));

  await actorIsAdmin({ ...INPUT, fetchImpl });

  assert.equal(
    calls[0].url,
    "https://api.github.com/repos/owner/repo/collaborators/some-user/permission",
  );
  assert.equal(calls[0].options.headers.Authorization, "Bearer token");
});

test("encodes the actor in the path", async () => {
  const { fetchImpl, calls } = fakeFetch(jsonResponse({ permission: "admin" }));

  await actorIsAdmin({ ...INPUT, actor: "a/b?c", fetchImpl });

  assert.match(calls[0].url, /collaborators\/a%2Fb%3Fc\/permission$/);
});

test("accepts an admin", async () => {
  const { fetchImpl } = fakeFetch(jsonResponse({ permission: "admin" }));

  assert.equal(await actorIsAdmin({ ...INPUT, fetchImpl }), true);
});

test("refuses every other permission", async () => {
  for (const permission of ["write", "maintain", "read", "triage", "none", "ADMIN", undefined]) {
    const { fetchImpl } = fakeFetch(jsonResponse({ permission }));
    assert.equal(await actorIsAdmin({ ...INPUT, fetchImpl }), false, String(permission));
  }
});

test("refuses a malformed body", async () => {
  for (const body of [null, [], "admin", 7]) {
    const { fetchImpl } = fakeFetch(jsonResponse(body));
    assert.equal(await actorIsAdmin({ ...INPUT, fetchImpl }), false);
  }
});

test("refuses when the request fails or answers an error", async () => {
  for (const response of [
    new Error("network down"),
    jsonResponse({}, 403),
    jsonResponse({}, 404),
  ]) {
    const { fetchImpl } = fakeFetch(response);
    assert.equal(await actorIsAdmin({ ...INPUT, fetchImpl }), false);
  }
});

function cli(env, response = jsonResponse({ permission: "admin" })) {
  const logs = { messages: [], errors: [] };
  const { fetchImpl } = fakeFetch(response);
  return {
    logs,
    run: () =>
      runCli({
        env,
        fetchImpl,
        log: (message) => logs.messages.push(message),
        logError: (message) => logs.errors.push(message),
      }),
  };
}

const ENV = { GITHUB_REPOSITORY: "owner/repo", GITHUB_TOKEN: "token", ACTOR: "some-user" };

test("the command succeeds for an admin", async () => {
  assert.equal(await cli(ENV).run(), 0);
});

test("the command fails for anyone else and says who", async () => {
  const { run, logs } = cli(ENV, jsonResponse({ permission: "write" }));

  assert.equal(await run(), 1);
  assert.match(logs.errors.join("\n"), /some-user/);
});

test("the command fails without its inputs", async () => {
  assert.equal(await cli({}).run(), 1);
  assert.equal(await cli({ ...ENV, ACTOR: "" }).run(), 1);
});

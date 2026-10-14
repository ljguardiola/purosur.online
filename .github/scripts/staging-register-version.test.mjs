import assert from "node:assert/strict";
import { test } from "node:test";
import { readStagingVersion, runCli } from "./staging-register-version.mjs";

const bucket = {
  endpoint: "https://storage.example.test",
  name: "register-updates-staging",
  region: "auto",
  accessKeyId: "fictional-access-key-id",
  secretAccessKey: "fictional-secret-access-key-0123456789",
};

const entry = (version) => JSON.stringify({ version, file: "Setup.exe", size: 1, sha512: "x" });

test("reads the installer version the staging feed serves, signed, from the bucket", async () => {
  const requests = [];

  const version = await readStagingVersion({
    bucket,
    fetchImpl: async (request) => {
      requests.push({ url: request.url, authorization: request.headers.get("authorization") });
      return new Response(entry("0.0.57"));
    },
  });

  assert.equal(version, "0.0.57");
  assert.equal(
    requests[0].url,
    "https://register-updates-staging.storage.example.test/register-updates/latest.json",
  );
  assert.match(requests[0].authorization, /^AWS4-HMAC-SHA256 /);
});

test("refuses a feed that is empty, unreadable, or serves something else than 0.0.N", async () => {
  for (const [response, message] of [
    [new Response("", { status: 404 }), /no register has been published/],
    [new Response("", { status: 403 }), /403/],
    [new Response("not json"), /not a release entry/],
    [new Response(entry("1.2.3")), /0\.0\.N/],
    [new Response(JSON.stringify({})), /0\.0\.N/],
  ]) {
    await assert.rejects(readStagingVersion({ bucket, fetchImpl: async () => response }), message);
  }
});

function cliHarness(env, response = new Response(entry("0.0.57"))) {
  const outputs = [];
  const errors = [];
  return {
    outputs,
    errors,
    options: {
      env: {
        GITHUB_OUTPUT: "out",
        POS_UPDATES_BUCKET_ENDPOINT: bucket.endpoint,
        POS_UPDATES_BUCKET_NAME: bucket.name,
        POS_UPDATES_BUCKET_REGION: bucket.region,
        POS_UPDATES_BUCKET_ACCESS_KEY_ID: bucket.accessKeyId,
        POS_UPDATES_BUCKET_SECRET_ACCESS_KEY: bucket.secretAccessKey,
        ...env,
      },
      fetchImpl: async () => response,
      appendOutput: async (_path, text) => outputs.push(text),
      log: () => {},
      logError: (message) => errors.push(message),
    },
  };
}

test("the CLI outputs the version", async () => {
  const harness = cliHarness({});

  assert.equal(await runCli(harness.options), 0);
  assert.deepEqual(harness.outputs, ["version=0.0.57\n"]);
});

test("the CLI refuses an unusable feed without printing the secret", async () => {
  const harness = cliHarness({}, new Response("", { status: 404 }));

  assert.equal(await runCli(harness.options), 1);
  assert.deepEqual(harness.outputs, []);
  assert.doesNotMatch(harness.errors.join("\n"), new RegExp(bucket.secretAccessKey));
});

test("the CLI names what is missing", async () => {
  const harness = cliHarness({
    POS_UPDATES_BUCKET_NAME: "",
    POS_UPDATES_BUCKET_SECRET_ACCESS_KEY: "",
  });

  assert.equal(await runCli(harness.options), 1);
  const output = harness.errors.join("\n");
  assert.match(output, /POS_UPDATES_BUCKET_NAME/);
  assert.match(output, /POS_UPDATES_BUCKET_SECRET_ACCESS_KEY/);
});

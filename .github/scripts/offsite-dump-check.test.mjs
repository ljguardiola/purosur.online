import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  checkOffsiteDump,
  readPostgresImage,
  restoreListCommands,
  runCli,
  runPipeline,
  signedGet,
} from "./offsite-dump-check.mjs";

const NIGHT = "2026-10-14";
const NOW = new Date("2026-10-14T10:05:00.000Z");
const DUMP = Buffer.from("encrypted-dump-bytes");
const SHA = createHash("sha256").update(DUMP).digest("hex");
const MANIFEST = { night: NIGHT, sizeBytes: DUMP.length, sha256: SHA };
const DUMP_KEY = `offsite-dumps/${NIGHT}.dump.age`;
const MANIFEST_KEY = `offsite-dumps/${NIGHT}.manifest.json`;

const ENV = {
  OFFSITE_DUMP_AGE_IDENTITY: "AGE-SECRET-KEY-FICTIONAL",
  OFFSITE_DUMP_READ_ACCESS_KEY_ID: "fictional-read-key-id",
  OFFSITE_DUMP_READ_SECRET_ACCESS_KEY: "fictional-read-secret",
  OFFSITE_DUMP_CHECK_TOKEN: "fictional-check-token",
  OFFSITE_DUMP_BUCKET_ENDPOINT: "https://s3.us-west-004.example-storage.test",
  OFFSITE_DUMP_BUCKET_NAME: "dump-vault",
  OFFSITE_DUMP_BUCKET_REGION: "us-west-004",
  OFFSITE_DUMP_CHECK_CLOUD_ORIGIN: "https://cloud.example.test",
};

function bucketUrl(key) {
  return `https://dump-vault.s3.us-west-004.example-storage.test/${key}`;
}

// Answers the bucket and the cloud like the real ones would, recording every request.
function fakeNetwork({ objects, reportStatus = 201 }) {
  const requests = [];
  async function fetchImpl(url, init = {}) {
    const method = init.method ?? "GET";
    requests.push({ url, method, headers: init.headers ?? {}, body: init.body });
    if (url === "https://cloud.example.test/api/backups/offsite-dump-checks") {
      return new Response(null, { status: reportStatus });
    }
    const key = url.replace("https://dump-vault.s3.us-west-004.example-storage.test/", "");
    const object = objects[key];
    if (object === undefined) {
      return new Response(null, { status: 404 });
    }
    if (typeof object === "number") {
      return new Response(null, { status: object });
    }
    return method === "HEAD" ? new Response(null, { status: 200 }) : new Response(object);
  }
  return { fetchImpl, requests };
}

function reports(requests) {
  return requests
    .filter((request) => request.method === "POST")
    .map((request) => JSON.parse(request.body));
}

async function withDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), "offsite-dump-check-test-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const HEALTHY = { objects: { [DUMP_KEY]: DUMP, [MANIFEST_KEY]: JSON.stringify(MANIFEST) } };

function check(options, overrides = {}) {
  return withDirectory(async (directory) => {
    const network = fakeNetwork(options);
    const decryptions = [];
    const result = await checkOffsiteDump({
      env: ENV,
      now: () => NOW,
      fetchImpl: network.fetchImpl,
      directory,
      decryptAndList: async (paths) => {
        decryptions.push({
          ...paths,
          identity: await readFile(paths.identityPath, "utf8"),
          identityMode: (await stat(paths.identityPath)).mode & 0o777,
          dump: await readFile(paths.dumpPath),
        });
        return { decryptExitCode: 0, listExitCode: 0 };
      },
      ...overrides,
    });
    return { result, network, decryptions };
  });
}

test("passes a night whose dump is there, the size and hash the manifest states, and readable", async () => {
  const { result } = await check(HEALTHY);

  assert.deepEqual(result, { night: NIGHT, outcome: "passed", sizeBytes: DUMP.length });
});

test("checks the night of the UTC calendar day it runs", async () => {
  const { network } = await check(HEALTHY, { now: () => new Date("2026-10-14T23:30:00.000Z") });

  assert.ok(network.requests.some((request) => request.url === bucketUrl(MANIFEST_KEY)));
});

test("reads the bucket with the read credential, signed for its region", async () => {
  const { network } = await check(HEALTHY);

  for (const request of network.requests) {
    assert.match(
      request.headers.authorization,
      /^AWS4-HMAC-SHA256 Credential=fictional-read-key-id\/20261014\/us-west-004\/s3\/aws4_request, /,
    );
  }
});

test("decrypts with the age identity from a private file", async () => {
  const { decryptions } = await check(HEALTHY);

  assert.equal(decryptions.length, 1);
  assert.equal(decryptions[0].identity, "AGE-SECRET-KEY-FICTIONAL");
  assert.equal(decryptions[0].identityMode, 0o600);
  assert.deepEqual(decryptions[0].dump, DUMP);
});

test("removes the identity file once the check is over", async () => {
  let identityPath;
  await check(HEALTHY, {
    decryptAndList: async (paths) => {
      identityPath = paths.identityPath;
      return { decryptExitCode: 0, listExitCode: 0 };
    },
  });

  await assert.rejects(stat(identityPath), { code: "ENOENT" });
});

test("removes the identity file even when the check fails", async () => {
  let identityPath;
  await check(HEALTHY, {
    decryptAndList: async (paths) => {
      identityPath = paths.identityPath;
      throw new Error("docker is not available");
    },
  }).catch(() => undefined);

  await assert.rejects(stat(identityPath), { code: "ENOENT" });
});

test("fails with object_missing when neither the manifest nor the dump is there", async () => {
  const { result } = await check({ objects: {} });

  assert.deepEqual(result, { night: NIGHT, outcome: "failed", reason: "object_missing" });
});

test("fails with object_missing when the manifest is there but the dump is not", async () => {
  const { result } = await check({ objects: { [MANIFEST_KEY]: JSON.stringify(MANIFEST) } });

  assert.deepEqual(result, { night: NIGHT, outcome: "failed", reason: "object_missing" });
});

test("fails with manifest_missing when the dump is there but its manifest is not", async () => {
  const { result } = await check({ objects: { [DUMP_KEY]: DUMP } });

  assert.deepEqual(result, { night: NIGHT, outcome: "failed", reason: "manifest_missing" });
});

test("fails with manifest_missing when the manifest is not a manifest", async () => {
  for (const manifest of [
    "not json",
    JSON.stringify({ night: NIGHT }),
    JSON.stringify({ ...MANIFEST, night: "2026-10-13" }),
  ]) {
    const { result } = await check({ objects: { [DUMP_KEY]: DUMP, [MANIFEST_KEY]: manifest } });

    assert.deepEqual(result, { night: NIGHT, outcome: "failed", reason: "manifest_missing" });
  }
});

test("fails with size_mismatch when the dump is not the size the manifest states", async () => {
  const manifest = JSON.stringify({ ...MANIFEST, sizeBytes: DUMP.length + 1 });
  const { result, decryptions } = await check({
    objects: { [DUMP_KEY]: DUMP, [MANIFEST_KEY]: manifest },
  });

  assert.deepEqual(result, { night: NIGHT, outcome: "failed", reason: "size_mismatch" });
  assert.deepEqual(decryptions, []);
});

test("fails with hash_mismatch when the bytes are not the ones the manifest hashed", async () => {
  const tampered = Buffer.from("encrypted-dump-BYTES");
  const { result, decryptions } = await check({
    objects: { [DUMP_KEY]: tampered, [MANIFEST_KEY]: JSON.stringify(MANIFEST) },
  });

  assert.deepEqual(result, { night: NIGHT, outcome: "failed", reason: "hash_mismatch" });
  assert.deepEqual(decryptions, []);
});

test("fails with decryption_failed when age cannot decrypt it", async () => {
  const { result } = await check(HEALTHY, {
    decryptAndList: async () => ({ decryptExitCode: 1, listExitCode: 1 }),
  });

  assert.deepEqual(result, { night: NIGHT, outcome: "failed", reason: "decryption_failed" });
});

test("fails with archive_unreadable when it decrypts but pg_restore cannot list it", async () => {
  const { result } = await check(HEALTHY, {
    decryptAndList: async () => ({ decryptExitCode: 0, listExitCode: 1 }),
  });

  assert.deepEqual(result, { night: NIGHT, outcome: "failed", reason: "archive_unreadable" });
});

test("does not classify what it cannot read: a refusal from the bucket is an error", async () => {
  await assert.rejects(check({ objects: { [MANIFEST_KEY]: 403 } }), /HTTP 403/);
  await assert.rejects(
    check({ objects: { [MANIFEST_KEY]: JSON.stringify(MANIFEST), [DUMP_KEY]: 500 } }),
    /HTTP 500/,
  );
});

function cli(options, overrides = {}) {
  return withDirectory(async (directory) => {
    const network = fakeNetwork(options);
    const logs = [];
    const exitCode = await runCli({
      env: ENV,
      now: () => NOW,
      fetchImpl: network.fetchImpl,
      directory,
      decryptAndList: async () => ({ decryptExitCode: 0, listExitCode: 0 }),
      log: (line) => logs.push(line),
      ...overrides,
    });
    return { exitCode, network, logs: logs.join("\n") };
  });
}

test("reports a passed night to the cloud with the bearer token and exits zero", async () => {
  const { exitCode, network } = await cli(HEALTHY);

  assert.equal(exitCode, 0);
  const post = network.requests.find((request) => request.method === "POST");
  assert.equal(post.url, "https://cloud.example.test/api/backups/offsite-dump-checks");
  assert.equal(post.headers.Authorization, "Bearer fictional-check-token");
  assert.equal(post.headers["Content-Type"], "application/json");
  assert.deepEqual(reports(network.requests), [
    { night: NIGHT, outcome: "passed", sizeBytes: DUMP.length },
  ]);
});

test("reports a failed night to the cloud, then exits non-zero so the run shows it too", async () => {
  const { exitCode, network, logs } = await cli({ objects: { [DUMP_KEY]: DUMP } });

  assert.equal(exitCode, 1);
  assert.deepEqual(reports(network.requests), [
    { night: NIGHT, outcome: "failed", reason: "manifest_missing" },
  ]);
  assert.match(logs, /offsite-dump-check: the dump of 2026-10-14 failed: manifest_missing/);
});

test("exits non-zero when the report cannot be delivered", async () => {
  const { exitCode, logs } = await cli({ ...HEALTHY, reportStatus: 401 });

  assert.equal(exitCode, 1);
  assert.match(logs, /answered HTTP 401/);
});

test("exits non-zero when the cloud cannot be reached", async () => {
  const { exitCode, logs } = await cli(HEALTHY, {
    fetchImpl: async (url, init) => {
      if (init?.method === "POST") {
        throw new Error("getaddrinfo EAI_AGAIN");
      }
      return await fakeNetwork(HEALTHY).fetchImpl(url, init);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(logs, /EAI_AGAIN/);
});

test("reports nothing and exits non-zero when the bucket cannot be read at all", async () => {
  const { exitCode, network, logs } = await cli({ objects: { [MANIFEST_KEY]: 403 } });

  assert.equal(exitCode, 1);
  assert.deepEqual(reports(network.requests), []);
  assert.match(logs, /HTTP 403/);
});

test("names every missing variable and does nothing else", async () => {
  const { exitCode, network, logs } = await cli(HEALTHY, {
    env: { ...ENV, OFFSITE_DUMP_AGE_IDENTITY: "", OFFSITE_DUMP_CHECK_TOKEN: undefined },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(network.requests, []);
  assert.match(logs, /OFFSITE_DUMP_AGE_IDENTITY, OFFSITE_DUMP_CHECK_TOKEN are not set/);
});

test("never logs the identity, a key or the token", async () => {
  const { logs } = await cli({ objects: { [MANIFEST_KEY]: 403 } });
  const failed = await cli({ ...HEALTHY, reportStatus: 401 });

  for (const text of [logs, failed.logs]) {
    for (const secret of [
      "AGE-SECRET-KEY-FICTIONAL",
      "fictional-read-secret",
      "fictional-check-token",
    ]) {
      assert.ok(!text.includes(secret));
    }
  }
});

// AWS's own worked example of a signed GET with a Range header (Signature Version 4, S3).
test("signs a request the way Signature Version 4 specifies", () => {
  const headers = signedGet({
    url: "https://examplebucket.s3.amazonaws.com/test.txt",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    now: new Date("2013-05-24T00:00:00.000Z"),
    headers: { range: "bytes=0-9" },
  });

  assert.equal(
    headers.authorization,
    "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
  );
});

test("reads the Postgres image from the repository's compose file", () => {
  const compose = readFileSync(new URL("../../docker-compose.yml", import.meta.url), "utf8");

  assert.match(
    readPostgresImage(compose),
    /^ghcr\.io\/ljguardiola\/postgres:\d+-alpine@sha256:[0-9a-f]{64}$/,
  );
});

test("refuses a compose file without a Postgres image", () => {
  assert.throws(() => readPostgresImage("services: {}"), /no Postgres image/);
});

test("lists the archive with the pinned image's pg_restore, reading it from standard input", () => {
  const commands = restoreListCommands({
    identityPath: "/work/identity",
    postgresImage: "ghcr.io/example/postgres:18-alpine@sha256:abc",
  });

  assert.deepEqual(commands.decrypt, {
    file: "age",
    args: ["--decrypt", "--identity", "/work/identity"],
  });
  assert.deepEqual(commands.list, {
    file: "docker",
    args: [
      "run",
      "--rm",
      "-i",
      "ghcr.io/example/postgres:18-alpine@sha256:abc",
      "pg_restore",
      "--format=custom",
      "--list",
    ],
  });
});

test("runs decrypt into list over a file and reports each exit code", async () => {
  await withDirectory(async (directory) => {
    const dumpPath = join(directory, "dump");
    await import("node:fs/promises").then(({ writeFile }) => writeFile(dumpPath, "payload"));
    const node = (script) => ({ file: process.execPath, args: ["-e", script] });
    const echo = "process.stdin.pipe(process.stdout)";
    const count =
      "let n=0;process.stdin.on('data',c=>n+=c.length).on('end',()=>process.exit(n===7?0:5))";

    assert.deepEqual(await runPipeline({ decrypt: node(echo), list: node(count) }, dumpPath), {
      decryptExitCode: 0,
      listExitCode: 0,
    });
    assert.deepEqual(
      await runPipeline({ decrypt: node("process.exit(2)"), list: node(count) }, dumpPath),
      { decryptExitCode: 2, listExitCode: 5 },
    );
  });
});

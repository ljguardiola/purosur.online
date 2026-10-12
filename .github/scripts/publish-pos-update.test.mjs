import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findInstaller, objectUrl, publishUpdate } from "./publish-pos-update.mjs";
import { forwardBucketFetch } from "./test-support/forward-bucket-fetch.mjs";

const cliPath = fileURLToPath(new URL("./publish-pos-update.mjs", import.meta.url));
const forwardedFetchPreload = fileURLToPath(
  new URL("./test-support/install-forwarded-fetch.mjs", import.meta.url),
);

const BUCKET_ENDPOINT = "https://storage.example.test";

const BUCKET_NAME = "register-updates-staging";
const SECRET_ACCESS_KEY = "fictional-secret-access-key-0123456789";
const INSTALLER_NAME = "Puro Sur Homologación Setup 0.0.57.exe";
const INSTALLER_BYTES = Buffer.from("fictional installer bytes ".repeat(5000));

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), "publish-pos-update-"));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function withInstallerDir(run) {
  return withTempDir(async (dir) => {
    await writeFile(join(dir, INSTALLER_NAME), INSTALLER_BYTES);
    return run(dir);
  });
}

function entryJson(version) {
  return JSON.stringify({
    version,
    file: "Puro Sur Homologación Setup old.exe",
    size: 10,
    sha512: createHash("sha512").update("old").digest("base64"),
  });
}

async function withFakeBucket({ stored = {}, failPutFor = [] } = {}, run) {
  const objects = new Map(Object.entries(stored).map(([key, value]) => [key, Buffer.from(value)]));
  const puts = [];
  const server = createServer(async (request, response) => {
    const key = decodeURIComponent(new URL(request.url, "http://localhost").pathname).slice(1);
    if (request.method === "GET") {
      const object = objects.get(key);
      response.statusCode = object ? 200 : 404;
      response.end(object ?? "<Error><Code>NoSuchKey</Code></Error>");
      return;
    }
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    puts.push({
      key,
      body,
      contentLength: request.headers["content-length"],
      contentType: request.headers["content-type"],
      authorization: request.headers.authorization,
    });
    if (failPutFor.some((part) => key.includes(part))) {
      response.statusCode = 500;
      response.end("<Error><Code>InternalError</Code></Error>");
      return;
    }
    objects.set(key, body);
    response.statusCode = 200;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const fetch = forwardBucketFetch(port, BUCKET_NAME);
  try {
    return await run({ endpoint: BUCKET_ENDPOINT, fetch, port, objects, puts });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function bucketAt(endpoint) {
  return {
    endpoint,
    name: BUCKET_NAME,
    region: "auto",
    accessKeyId: "fictional-access-key-id",
    secretAccessKey: SECRET_ACCESS_KEY,
  };
}

const sha512OfInstaller = createHash("sha512").update(INSTALLER_BYTES).digest("base64");

test("publishes the installer and then the entry that points at it when the feed is empty", async () => {
  await withInstallerDir((installerDir) =>
    withFakeBucket({}, async ({ endpoint, fetch, objects, puts }) => {
      const result = await publishUpdate({
        installerDir,
        version: "0.0.57",
        bucket: bucketAt(endpoint),
        fetch,
      });

      assert.equal(result.published, true);
      const installerKey = `${BUCKET_NAME}/register-updates/0.0.57/${INSTALLER_NAME}`;
      const entryKey = `${BUCKET_NAME}/register-updates/latest.json`;
      assert.deepEqual(
        puts.map((put) => put.key),
        [installerKey, entryKey],
      );
      assert.deepEqual(objects.get(installerKey), INSTALLER_BYTES);
      assert.deepEqual(JSON.parse(objects.get(entryKey).toString()), {
        version: "0.0.57",
        file: INSTALLER_NAME,
        size: INSTALLER_BYTES.length,
        sha512: sha512OfInstaller,
      });
    }),
  );
});

test("sends the installer with its length and a binary content type, signed", async () => {
  await withInstallerDir((installerDir) =>
    withFakeBucket({}, async ({ endpoint, fetch, puts }) => {
      await publishUpdate({ installerDir, version: "0.0.57", bucket: bucketAt(endpoint), fetch });

      assert.equal(puts[0].contentLength, String(INSTALLER_BYTES.length));
      assert.equal(puts[0].contentType, "application/octet-stream");
      assert.match(puts[0].authorization, /^AWS4-HMAC-SHA256 /);
      assert.match(puts[1].authorization, /^AWS4-HMAC-SHA256 /);
    }),
  );
});

test("publishes when the feed holds an older version", async () => {
  await withInstallerDir((installerDir) =>
    withFakeBucket(
      { stored: { [`${BUCKET_NAME}/register-updates/latest.json`]: entryJson("0.0.9") } },
      async ({ endpoint, fetch, puts }) => {
        const result = await publishUpdate({
          installerDir,
          version: "0.0.57",
          bucket: bucketAt(endpoint),
          fetch,
        });

        assert.equal(result.published, true);
        assert.equal(puts.length, 2);
      },
    ),
  );
});

for (const published of ["0.0.57", "0.0.58", "0.1.0"]) {
  test(`uploads nothing when the feed already holds ${published}`, async () => {
    await withInstallerDir((installerDir) =>
      withFakeBucket(
        { stored: { [`${BUCKET_NAME}/register-updates/latest.json`]: entryJson(published) } },
        async ({ endpoint, fetch, puts }) => {
          const result = await publishUpdate({
            installerDir,
            version: "0.0.57",
            bucket: bucketAt(endpoint),
            fetch,
          });

          assert.equal(result.published, false);
          assert.deepEqual(puts, []);
        },
      ),
    );
  });
}

test("fails without writing the entry when the installer upload fails", async () => {
  await withInstallerDir((installerDir) =>
    withFakeBucket({ failPutFor: [".exe"] }, async ({ endpoint, fetch, objects, puts }) => {
      await assert.rejects(
        publishUpdate({ installerDir, version: "0.0.57", bucket: bucketAt(endpoint), fetch }),
        /installer/i,
      );

      assert.deepEqual(
        puts.map((put) => put.key.endsWith("latest.json")),
        [false],
      );
      assert.equal(objects.has(`${BUCKET_NAME}/register-updates/latest.json`), false);
    }),
  );
});

test("fails when the entry it finds is not a release entry", async () => {
  await withInstallerDir((installerDir) =>
    withFakeBucket(
      {
        stored: { [`${BUCKET_NAME}/register-updates/latest.json`]: '{"version":"not a version"}' },
      },
      async ({ endpoint, fetch, puts }) => {
        await assert.rejects(
          publishUpdate({ installerDir, version: "0.0.57", bucket: bucketAt(endpoint), fetch }),
          /latest\.json/,
        );
        assert.deepEqual(puts, []);
      },
    ),
  );
});

test("fails when reading the entry is refused for a reason other than being absent", async () => {
  await withInstallerDir(async (installerDir) => {
    const server = createServer((_request, response) => {
      response.statusCode = 403;
      response.end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      await assert.rejects(
        publishUpdate({
          installerDir,
          version: "0.0.57",
          bucket: bucketAt(BUCKET_ENDPOINT),
          fetch: forwardBucketFetch(server.address().port, BUCKET_NAME),
        }),
        /403/,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test("refuses a version that is not X.Y.Z before touching the bucket", async () => {
  await withInstallerDir((installerDir) =>
    withFakeBucket({}, async ({ endpoint, fetch, puts }) => {
      await assert.rejects(
        publishUpdate({ installerDir, version: "1.2", bucket: bucketAt(endpoint), fetch }),
        /version/i,
      );
      assert.deepEqual(puts, []);
    }),
  );
});

test("addresses an object by the bucket's host name, as the cloud does", () => {
  assert.equal(
    objectUrl(
      { endpoint: "https://storage.example.test", name: "register-updates-staging" },
      "register-updates/0.0.57/Puro Sur Setup 0.0.57.exe",
    ),
    "https://register-updates-staging.storage.example.test/register-updates/0.0.57/Puro%20Sur%20Setup%200.0.57.exe",
  );
});

test("finds the one installer in a directory", async () => {
  await withInstallerDir(async (dir) => {
    await writeFile(join(dir, "notes.txt"), "not an installer");

    assert.equal(await findInstaller(dir), join(dir, INSTALLER_NAME));
  });
});

test("refuses a directory with no installer or with several", async () => {
  await withTempDir(async (dir) => {
    await assert.rejects(findInstaller(dir), /exactly one/);
    await writeFile(join(dir, "a.exe"), "a");
    await writeFile(join(dir, "b.exe"), "b");
    await assert.rejects(findInstaller(dir), /exactly one/);
  });
});

function runCli(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", forwardedFetchPreload, cliPath, ...args], {
      env: { PATH: process.env.PATH, ...env },
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("close", (status) => resolve({ status, output }));
  });
}

function cliEnv(endpoint, port, version = "0.0.57") {
  return {
    FAKE_BUCKET_PORT: String(port),
    POS_UPDATES_BUCKET_ENDPOINT: endpoint,
    POS_UPDATES_BUCKET_NAME: BUCKET_NAME,
    POS_UPDATES_BUCKET_REGION: "auto",
    POS_UPDATES_BUCKET_ACCESS_KEY_ID: "fictional-access-key-id",
    POS_UPDATES_BUCKET_SECRET_ACCESS_KEY: SECRET_ACCESS_KEY,
    POS_VERSION: version,
  };
}

test("the CLI publishes and exits 0, never printing the secret", async () => {
  await withInstallerDir((installerDir) =>
    withFakeBucket({}, async ({ endpoint, port, puts }) => {
      const result = await runCli([installerDir], cliEnv(endpoint, port));

      assert.equal(result.status, 0, result.output);
      assert.equal(puts.length, 2);
      assert.equal(result.output.includes(SECRET_ACCESS_KEY), false);
    }),
  );
});

test("the CLI exits 0 with a notice when the feed is not older", async () => {
  await withInstallerDir((installerDir) =>
    withFakeBucket(
      { stored: { [`${BUCKET_NAME}/register-updates/latest.json`]: entryJson("0.0.60") } },
      async ({ endpoint, port, puts }) => {
        const result = await runCli([installerDir], cliEnv(endpoint, port));

        assert.equal(result.status, 0, result.output);
        assert.match(result.output, /::notice::/);
        assert.deepEqual(puts, []);
      },
    ),
  );
});

test("the CLI exits 1 and never prints the secret when the upload fails", async () => {
  await withInstallerDir((installerDir) =>
    withFakeBucket({ failPutFor: [".exe"] }, async ({ endpoint, port, objects }) => {
      const result = await runCli([installerDir], cliEnv(endpoint, port));

      assert.equal(result.status, 1);
      assert.match(result.output, /::error::/);
      assert.equal(result.output.includes(SECRET_ACCESS_KEY), false);
      assert.equal(objects.has(`${BUCKET_NAME}/register-updates/latest.json`), false);
    }),
  );
});

test("the CLI exits 1 naming what is missing when run without its inputs", async () => {
  const result = await runCli([], {});

  assert.equal(result.status, 1);
  assert.match(result.output, /POS_UPDATES_BUCKET_ENDPOINT/);
});

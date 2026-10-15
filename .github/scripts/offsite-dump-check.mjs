import { spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { createReadStream, createWriteStream, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const LOG_PREFIX = "offsite-dump-check";
const REQUEST_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;

const VARIABLES = [
  "OFFSITE_DUMP_AGE_IDENTITY",
  "OFFSITE_DUMP_READ_ACCESS_KEY_ID",
  "OFFSITE_DUMP_READ_SECRET_ACCESS_KEY",
  "OFFSITE_DUMP_CHECK_TOKEN",
  "OFFSITE_DUMP_BUCKET_ENDPOINT",
  "OFFSITE_DUMP_BUCKET_NAME",
  "OFFSITE_DUMP_BUCKET_REGION",
  "OFFSITE_DUMP_CHECK_CLOUD_ORIGIN",
];

// The manifest is validated here instead of with packages/contracts' schema because this script
// is plain JavaScript that node runs without building the workspace.
const SHA256_HEX = /^[0-9a-f]{64}$/;
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key, data) {
  return createHmac("sha256", key).update(data).digest();
}

/** AWS Signature Version 4 for a body-less request to S3, as the headers to send. */
export function signedGet({
  url,
  method = "GET",
  region,
  accessKeyId,
  secretAccessKey,
  now,
  headers = {},
}) {
  const target = new URL(url);
  const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256Hex("");
  const toSign = {
    ...headers,
    host: target.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const names = Object.keys(toSign).sort();
  const canonicalHeaders = names.map((name) => `${name}:${String(toSign[name]).trim()}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    method,
    target.pathname,
    target.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${day}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const { host: _host, ...sendable } = toSign;
  return {
    ...sendable,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

export function readPostgresImage(composeText) {
  const image = /^\s*image:\s*(\S*postgres\S*)\s*$/m.exec(composeText)?.[1];
  if (!image) {
    throw new Error(`${LOG_PREFIX}: docker-compose.yml names no Postgres image`);
  }
  return image;
}

export function restoreListCommands({ identityPath, postgresImage }) {
  return {
    decrypt: { file: "age", args: ["--decrypt", "--identity", identityPath] },
    // Same Postgres major as the pg_dump that wrote the archive.
    list: {
      file: "docker",
      args: ["run", "--rm", "-i", postgresImage, "pg_restore", "--format=custom", "--list"],
    },
  };
}

// `docker run` exits 125 when docker itself fails, and 126 or 127 when it cannot invoke or find the
// command it was given, so none of them is the command's own verdict on the archive.
const COULD_NOT_RUN_EXIT_CODES = [125, 126, 127];

function exitCodeOf(label, child) {
  return new Promise((resolve, reject) => {
    child.once("error", () =>
      reject(new Error(`${LOG_PREFIX}: the ${label} command could not be started`)),
    );
    child.once("close", (code, signal) => {
      if (code === null) {
        reject(new Error(`${LOG_PREFIX}: the ${label} command was stopped by ${signal}`));
      } else if (COULD_NOT_RUN_EXIT_CODES.includes(code)) {
        reject(new Error(`${LOG_PREFIX}: the ${label} command could not run (exit code ${code})`));
      } else {
        resolve(code);
      }
    });
  });
}

/**
 * Feeds the file through `decrypt` into `list`, reporting the exit code each command gave as its
 * own verdict; a command that could not be started or run is an error instead.
 */
export async function runPipeline(commands, dumpPath) {
  const decrypt = spawn(commands.decrypt.file, commands.decrypt.args, {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const list = spawn(commands.list.file, commands.list.args, {
    stdio: ["pipe", "ignore", "inherit"],
  });
  const ignoreBrokenPipe = (stream) => stream?.on("error", () => undefined);
  for (const stream of [decrypt.stdin, decrypt.stdout, list.stdin]) {
    ignoreBrokenPipe(stream);
  }
  const exits = Promise.all([exitCodeOf("decrypt", decrypt), exitCodeOf("list", list)]);
  exits.catch(() => undefined);
  await Promise.allSettled([
    pipeline(createReadStream(dumpPath), decrypt.stdin),
    pipeline(decrypt.stdout, list.stdin),
  ]);
  const [decryptExitCode, listExitCode] = await exits;
  return { decryptExitCode, listExitCode };
}

function bucketUrl(env, key) {
  const endpoint = new URL(env.OFFSITE_DUMP_BUCKET_ENDPOINT);
  return `${endpoint.protocol}//${env.OFFSITE_DUMP_BUCKET_NAME}.${endpoint.host}/${key}`;
}

async function bucketRequest({ env, now, fetchImpl, method, key, timeoutMs = REQUEST_TIMEOUT_MS }) {
  const url = bucketUrl(env, key);
  const headers = signedGet({
    url,
    method,
    region: env.OFFSITE_DUMP_BUCKET_REGION,
    accessKeyId: env.OFFSITE_DUMP_READ_ACCESS_KEY_ID,
    secretAccessKey: env.OFFSITE_DUMP_READ_SECRET_ACCESS_KEY,
    now: now(),
  });
  const response = await fetchImpl(url, {
    method,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status !== 404 && !response.ok) {
    throw new Error(`${LOG_PREFIX}: ${method} ${key} answered HTTP ${response.status}`);
  }
  return response;
}

function parseManifest(text, night) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    return undefined;
  }
  const valid =
    manifest !== null &&
    typeof manifest === "object" &&
    manifest.night === night &&
    CALENDAR_DAY.test(manifest.night) &&
    Number.isInteger(manifest.sizeBytes) &&
    manifest.sizeBytes >= 0 &&
    typeof manifest.sha256 === "string" &&
    SHA256_HEX.test(manifest.sha256);
  return valid ? manifest : undefined;
}

async function download(response, path) {
  const hash = createHash("sha256");
  let sizeBytes = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      sizeBytes += chunk.length;
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), counter, createWriteStream(path));
  return { sizeBytes, sha256: hash.digest("hex") };
}

function failed(night, reason) {
  return { night, outcome: "failed", reason };
}

/**
 * Looks at the night's dump and says how it fares. A bucket that refuses the read credential is an
 * error instead of a verdict: nothing is known about the dump then, so nothing is reported on it.
 */
export async function checkOffsiteDump({ env, now, fetchImpl, directory, decryptAndList }) {
  const night = now().toISOString().slice(0, 10);
  const dumpKey = `offsite-dumps/${night}.dump.age`;
  const request = (method, key, timeoutMs) =>
    bucketRequest({ env, now, fetchImpl, method, key, timeoutMs });

  const manifestResponse = await request("GET", `offsite-dumps/${night}.manifest.json`);
  const manifestText = manifestResponse.status === 404 ? undefined : await manifestResponse.text();
  const manifest = manifestText === undefined ? undefined : parseManifest(manifestText, night);

  if (manifest === undefined) {
    const dumpResponse = await request("HEAD", dumpKey);
    return failed(night, dumpResponse.status === 404 ? "object_missing" : "manifest_missing");
  }

  const dumpResponse = await request("GET", dumpKey, DOWNLOAD_TIMEOUT_MS);
  if (dumpResponse.status === 404) {
    return failed(night, "object_missing");
  }
  const dumpPath = join(directory, "dump.age");
  const downloaded = await download(dumpResponse, dumpPath);
  if (downloaded.sizeBytes !== manifest.sizeBytes) {
    return failed(night, "size_mismatch");
  }
  if (downloaded.sha256 !== manifest.sha256) {
    return failed(night, "hash_mismatch");
  }

  const identityPath = join(directory, "identity");
  await writeFile(identityPath, env.OFFSITE_DUMP_AGE_IDENTITY, { mode: 0o600 });
  try {
    const { decryptExitCode, listExitCode } = await decryptAndList({ identityPath, dumpPath });
    if (decryptExitCode !== 0) {
      return failed(night, "decryption_failed");
    }
    if (listExitCode !== 0) {
      return failed(night, "archive_unreadable");
    }
  } finally {
    await rm(identityPath, { force: true });
  }
  return { night, outcome: "passed", sizeBytes: downloaded.sizeBytes };
}

async function deliver({ env, fetchImpl, report }) {
  const url = `${env.OFFSITE_DUMP_CHECK_CLOUD_ORIGIN}/api/backups/offsite-dump-checks`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OFFSITE_DUMP_CHECK_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(report),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${LOG_PREFIX}: reporting to the cloud answered HTTP ${response.status}`);
  }
}

export async function runCli({
  env = process.env,
  now = () => new Date(),
  fetchImpl = fetch,
  directory,
  decryptAndList,
  log = console.error,
}) {
  const missing = VARIABLES.filter((name) => !env[name]);
  if (missing.length > 0) {
    log(`${LOG_PREFIX}: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set`);
    return 1;
  }
  const ownDirectory = directory ?? (await mkdtemp(join(tmpdir(), "offsite-dump-check-")));
  try {
    const report = await checkOffsiteDump({
      env,
      now,
      fetchImpl,
      directory: ownDirectory,
      decryptAndList,
    });
    await deliver({ env, fetchImpl, report });
    if (report.outcome === "failed") {
      log(`${LOG_PREFIX}: the dump of ${report.night} failed: ${report.reason}`);
      return 1;
    }
    log(`${LOG_PREFIX}: the dump of ${report.night} passed (${report.sizeBytes} bytes)`);
    return 0;
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    if (directory === undefined) {
      await rm(ownDirectory, { recursive: true, force: true });
    }
  }
}

export function decryptAndListWithComposeImage(readComposeFile) {
  return ({ identityPath, dumpPath }) => {
    const postgresImage = readPostgresImage(readComposeFile());
    return runPipeline(restoreListCommands({ identityPath, postgresImage }), dumpPath);
  };
}

if (import.meta.main) {
  runCli({
    decryptAndList: decryptAndListWithComposeImage(() =>
      readFileSync(new URL("../../docker-compose.yml", import.meta.url), "utf8"),
    ),
  }).then(
    (exitCode) => process.exit(exitCode),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}

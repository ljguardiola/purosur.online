import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { AwsClient } from "aws4fetch";

const UPDATES_PREFIX = "register-updates";
const ENTRY_KEY = `${UPDATES_PREFIX}/latest.json`;

const BUCKET_VARIABLES = {
  endpoint: "POS_UPDATES_BUCKET_ENDPOINT",
  name: "POS_UPDATES_BUCKET_NAME",
  region: "POS_UPDATES_BUCKET_REGION",
  accessKeyId: "POS_UPDATES_BUCKET_ACCESS_KEY_ID",
  secretAccessKey: "POS_UPDATES_BUCKET_SECRET_ACCESS_KEY",
};

export async function findInstaller(directory) {
  const installers = (await readdir(directory)).filter((name) => name.endsWith(".exe"));
  if (installers.length !== 1) {
    throw new Error(`${directory} must hold exactly one installer; found ${installers.length}`);
  }
  return join(directory, installers[0]);
}

function digestsOf(path) {
  return new Promise((resolve, reject) => {
    const sha256 = createHash("sha256");
    const sha512 = createHash("sha512");
    let size = 0;
    createReadStream(path)
      .on("data", (chunk) => {
        size += chunk.length;
        sha256.update(chunk);
        sha512.update(chunk);
      })
      .on("error", reject)
      .on("end", () =>
        resolve({ size, sha256: sha256.digest("hex"), sha512: sha512.digest("base64") }),
      );
  });
}

export function objectUrl(bucket, key) {
  const endpoint = new URL(bucket.endpoint);
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${endpoint.protocol}//${bucket.name}.${endpoint.host}/${path}`;
}

function failureOf(action, response) {
  return new Error(`${action} failed with status ${response.status}`);
}

async function readEntry(send, bucket, schema) {
  const response = await send(objectUrl(bucket, ENTRY_KEY));
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw failureOf(`Reading ${ENTRY_KEY}`, response);
  }
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    throw new Error(`${ENTRY_KEY} in the bucket is not a release entry`);
  }
  return parsed.data;
}

async function putObject(send, bucket, key, { body, contentType, contentLength, sha256 }) {
  const response = await send(objectUrl(bucket, key), {
    method: "PUT",
    body,
    duplex: "half",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(contentLength),
      "X-Amz-Content-Sha256": sha256,
    },
  });
  if (!response.ok) {
    throw failureOf(`Uploading ${key}`, response);
  }
}

export async function publishUpdate({
  installerDir,
  version: versionText,
  bucket,
  fetch: fetchRequest = fetch,
}) {
  const { registerReleaseEntrySchema, registerVersionSchema } = await import(
    "../../packages/contracts/src/register/register-update.ts"
  );
  const { isNewerRegisterVersion } = await import(
    "../../packages/domain/src/register/model/register-version.ts"
  );

  const parsedVersion = registerVersionSchema.safeParse(versionText);
  if (!parsedVersion.success) {
    throw new Error(`The version must be X.Y.Z; got ${versionText}`);
  }
  const installerPath = await findInstaller(installerDir);
  const file = installerPath.slice(installerDir.length).replace(/^[\\/]+/, "");

  const client = new AwsClient({
    accessKeyId: bucket.accessKeyId,
    secretAccessKey: bucket.secretAccessKey,
    region: bucket.region,
    service: "s3",
    retries: 0,
  });

  const send = async (url, init) => fetchRequest(await client.sign(url, init));

  const published = await readEntry(send, bucket, registerReleaseEntrySchema);
  if (published && !isNewerRegisterVersion(published.version, parsedVersion.data)) {
    return {
      published: false,
      reason: `the feed already holds ${registerVersionText(published.version)}, not older than ${versionText}`,
    };
  }

  const digests = await digestsOf(installerPath);
  try {
    await putObject(send, bucket, `${UPDATES_PREFIX}/${versionText}/${file}`, {
      body: Readable.toWeb(createReadStream(installerPath)),
      contentType: "application/octet-stream",
      contentLength: digests.size,
      sha256: digests.sha256,
    });
  } catch (error) {
    throw new Error(`The installer upload failed: ${error.message}`, { cause: error });
  }

  const entry = JSON.stringify({
    version: versionText,
    file,
    size: digests.size,
    sha512: digests.sha512,
  });
  await putObject(send, bucket, ENTRY_KEY, {
    body: entry,
    contentType: "application/json",
    contentLength: Buffer.byteLength(entry),
    sha256: createHash("sha256").update(entry).digest("hex"),
  });
  return { published: true, reason: `published ${versionText}` };
}

function registerVersionText({ major, minor, patch }) {
  return [major, minor, patch].join(".");
}

async function main() {
  const requireNewer = process.argv[2] === "--require-newer";
  const installerDir = process.argv[requireNewer ? 3 : 2];
  const missing = [
    ...(installerDir ? [] : ["the installer directory argument"]),
    ...Object.values(BUCKET_VARIABLES).filter((name) => !process.env[name]),
    ...(process.env.POS_VERSION ? [] : ["POS_VERSION"]),
  ];
  if (missing.length > 0) {
    console.error(`::error::Missing: ${missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const bucket = Object.fromEntries(
    Object.entries(BUCKET_VARIABLES).map(([field, name]) => [field, process.env[name]]),
  );
  try {
    const result = await publishUpdate({
      installerDir,
      version: process.env.POS_VERSION,
      bucket,
    });
    if (result.published) {
      console.log(`publish-pos-update: ${result.reason}`);
    } else if (requireNewer) {
      console.error(`::error::${result.reason}`);
      process.exitCode = 1;
    } else {
      console.log(`::notice::${result.reason}`);
    }
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}

export function bucketFromEnv() {
  return { bucket: {}, missing: [] };
}

export async function installerSha512() {
  return "";
}

export async function readPublishedEntry() {
  return undefined;
}

if (import.meta.main) {
  main();
}

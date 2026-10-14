import { appendFile } from "node:fs/promises";
import { AwsClient } from "aws4fetch";
import { objectUrl } from "./publish-pos-update.mjs";

const LOG_PREFIX = "staging-register-version";
const ENTRY_KEY = "register-updates/latest.json";
const INSTALLER_VERSION_RE = /^0\.0\.[1-9]\d*$/;

const BUCKET_VARIABLES = {
  endpoint: "POS_UPDATES_BUCKET_ENDPOINT",
  name: "POS_UPDATES_BUCKET_NAME",
  region: "POS_UPDATES_BUCKET_REGION",
  accessKeyId: "POS_UPDATES_BUCKET_ACCESS_KEY_ID",
  secretAccessKey: "POS_UPDATES_BUCKET_SECRET_ACCESS_KEY",
};

export async function readStagingVersion({ bucket, fetchImpl = fetch }) {
  const client = new AwsClient({
    accessKeyId: bucket.accessKeyId,
    secretAccessKey: bucket.secretAccessKey,
    region: bucket.region,
    service: "s3",
    retries: 0,
  });
  const response = await fetchImpl(await client.sign(objectUrl(bucket, ENTRY_KEY)));
  if (response.status === 404) {
    throw new Error(`${LOG_PREFIX}: no register has been published to the staging feed yet`);
  }
  if (!response.ok) {
    throw new Error(`${LOG_PREFIX}: reading ${ENTRY_KEY} failed with status ${response.status}`);
  }
  const entry = await response.json().catch(() => undefined);
  if (typeof entry !== "object" || entry === null) {
    throw new Error(`${LOG_PREFIX}: ${ENTRY_KEY} is not a release entry`);
  }
  if (typeof entry.version !== "string" || !INSTALLER_VERSION_RE.test(entry.version)) {
    throw new Error(
      `${LOG_PREFIX}: the staging feed serves ${JSON.stringify(entry.version)}, not an installer version 0.0.N`,
    );
  }
  return entry.version;
}

export async function runCli({
  env = process.env,
  fetchImpl = fetch,
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const missing = ["GITHUB_OUTPUT", ...Object.values(BUCKET_VARIABLES)].filter(
    (name) => !env[name],
  );
  if (missing.length > 0) {
    logError(`${LOG_PREFIX}: ${missing.join(", ")} required`);
    return 1;
  }
  const bucket = Object.fromEntries(
    Object.entries(BUCKET_VARIABLES).map(([field, name]) => [field, env[name]]),
  );
  try {
    const version = await readStagingVersion({ bucket, fetchImpl });
    log(`${LOG_PREFIX}: the staging feed serves ${version}`);
    await appendOutput(env.GITHUB_OUTPUT, `version=${version}\n`);
    return 0;
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.main) {
  runCli().then(
    (exitCode) => process.exit(exitCode),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}

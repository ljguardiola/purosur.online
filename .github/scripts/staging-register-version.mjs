import { appendFile } from "node:fs/promises";
import { bucketFromEnv, readPublishedEntry } from "./publish-pos-update.mjs";
import { assertInstallerVersion } from "./register-candidate.mjs";

const LOG_PREFIX = "staging-register-version";

export async function readStagingRelease({ bucket, fetchImpl = fetch }) {
  const entry = await readPublishedEntry({ bucket, fetch: fetchImpl });
  if (entry === undefined) {
    throw new Error(`${LOG_PREFIX}: no register has been published to the staging feed yet`);
  }
  assertInstallerVersion(entry.version);
  return { version: entry.version, sha512: entry.sha512 };
}

export async function runCli({
  env = process.env,
  fetchImpl = fetch,
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const { bucket, missing: missingBucket } = bucketFromEnv(env);
  const missing = [...(env.GITHUB_OUTPUT ? [] : ["GITHUB_OUTPUT"]), ...missingBucket];
  if (missing.length > 0) {
    logError(`${LOG_PREFIX}: ${missing.join(", ")} required`);
    return 1;
  }
  try {
    const { version, sha512 } = await readStagingRelease({ bucket, fetchImpl });
    log(`${LOG_PREFIX}: the staging feed serves ${version}`);
    await appendOutput(env.GITHUB_OUTPUT, `version=${version}\nsha512=${sha512}\n`);
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

import { appendFile } from "node:fs/promises";
import { fetchStagingVersion } from "./cloud-changed.mjs";

const LOG_PREFIX = "staging-version";
const SHA_RE = /^[0-9a-f]{40}$/;

export async function runCli({
  env = process.env,
  fetchImpl = fetch,
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const { CLOUD_HEALTH_DOMAIN, GITHUB_OUTPUT } = env;
  if (!CLOUD_HEALTH_DOMAIN || !GITHUB_OUTPUT) {
    logError(`${LOG_PREFIX}: CLOUD_HEALTH_DOMAIN and GITHUB_OUTPUT are required`);
    return 1;
  }

  const version = await fetchStagingVersion({ domain: CLOUD_HEALTH_DOMAIN, fetchImpl, log });
  if (typeof version !== "string" || !SHA_RE.test(version)) {
    logError(
      `${LOG_PREFIX}: ${CLOUD_HEALTH_DOMAIN} reports version ${JSON.stringify(version)}, not a commit SHA`,
    );
    return 1;
  }
  log(`${LOG_PREFIX}: ${CLOUD_HEALTH_DOMAIN} serves ${version}`);
  await appendOutput(GITHUB_OUTPUT, `sha=${version}\n`);
  return 0;
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

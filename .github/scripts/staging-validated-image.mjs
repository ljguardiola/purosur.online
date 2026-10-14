import { appendFile, readFile as readFileFromDisk } from "node:fs/promises";

const LOG_PREFIX = "staging-validated-image";
const SHA_RE = /^[0-9a-f]{40}$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

export const IMAGE_REPOSITORY = "ghcr.io/ljguardiola/purosur-cloud";

export function stagingValidatedTag(sha) {
  const normalized = typeof sha === "string" ? sha.toLowerCase() : "";
  if (!SHA_RE.test(normalized)) {
    throw new Error(`${LOG_PREFIX}: ${JSON.stringify(sha)} is not a 40-character commit SHA`);
  }
  return `staging-validated-${normalized}`;
}

export function stagingValidatedImage(sha) {
  return `${IMAGE_REPOSITORY}:${stagingValidatedTag(sha)}`;
}

export function digestImageRef(manifestJson) {
  let manifest;
  try {
    manifest = JSON.parse(manifestJson);
  } catch {
    throw new Error(`${LOG_PREFIX}: the inspected manifest is not JSON, so it has no digest`);
  }
  const digest = manifest?.digest;
  if (typeof digest !== "string" || !DIGEST_RE.test(digest)) {
    throw new Error(
      `${LOG_PREFIX}: the inspected manifest has no sha256 digest (got ${JSON.stringify(digest)})`,
    );
  }
  return `${IMAGE_REPOSITORY}@${digest}`;
}

export async function runCli({
  argv = process.argv.slice(2),
  env = process.env,
  readFile = (path) => readFileFromDisk(path, "utf8"),
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const { GITHUB_OUTPUT, TARGET_SHA, MANIFEST_FILE } = env;
  const [command] = argv;
  if (!GITHUB_OUTPUT) {
    logError(`${LOG_PREFIX}: GITHUB_OUTPUT is required`);
    return 1;
  }

  try {
    if (command === "tag") {
      if (!TARGET_SHA) {
        logError(`${LOG_PREFIX}: TARGET_SHA is required`);
        return 1;
      }
      const image = stagingValidatedImage(TARGET_SHA);
      log(`${LOG_PREFIX}: ${image}`);
      await appendOutput(GITHUB_OUTPUT, `image=${image}\n`);
      return 0;
    }
    if (command === "digest") {
      if (!MANIFEST_FILE) {
        logError(`${LOG_PREFIX}: MANIFEST_FILE is required`);
        return 1;
      }
      const imageRef = digestImageRef(await readFile(MANIFEST_FILE));
      log(`${LOG_PREFIX}: ${imageRef}`);
      await appendOutput(GITHUB_OUTPUT, `image_ref=${imageRef}\n`);
      return 0;
    }
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    return 1;
  }
  logError(`${LOG_PREFIX}: the command must be "tag" or "digest"`);
  return 1;
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

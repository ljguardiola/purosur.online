import { readFile as readFileFromDisk } from "node:fs/promises";

const LOG_PREFIX = "readable-event-versions-check";
const REQUEST_TIMEOUT_MS = 30_000;

async function readableEventVersionsSchema() {
  const contracts = await import("../../packages/contracts/src/sync/readable-event-versions.ts");
  return contracts.readableEventVersionsSchema;
}

export function unreadableVersions({ emitted, readable }) {
  const known = new Set(readable);
  return emitted.filter((version) => !known.has(version)).sort();
}

export async function fetchReadableVersions({ origin, token, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(`${origin}/api/sync/readable-event-versions`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      `${LOG_PREFIX}: GET readable-event-versions failed: ${error instanceof Error ? error.message : error}`,
    );
  }
  if (response.status !== 200) {
    throw new Error(
      `${LOG_PREFIX}: GET readable-event-versions answered status ${response.status}`,
    );
  }
  const body = (await readableEventVersionsSchema()).safeParse(
    await response.json().catch(() => undefined),
  );
  if (!body.success) {
    throw new Error(`${LOG_PREFIX}: GET readable-event-versions answered a malformed body`);
  }
  return body.data.event_versions;
}

async function readEmittedVersions(path, readFile) {
  const emitted = (await readableEventVersionsSchema()).shape.event_versions.safeParse(
    JSON.parse(await readFile(path)),
  );
  if (!emitted.success || emitted.data.length === 0) {
    throw new Error(`${LOG_PREFIX}: ${path} is not a list of emitted type@N event versions`);
  }
  return emitted.data;
}

export async function runCli({
  env = process.env,
  readFile = (path) => readFileFromDisk(path, "utf8"),
  fetchImpl = fetch,
  log = console.log,
  logError = console.error,
} = {}) {
  const { PRODUCTION_ORIGIN, RELEASE_CHECK_TOKEN, EMITTED_EVENT_VERSIONS_FILE } = env;
  const missing = [
    "PRODUCTION_ORIGIN",
    "RELEASE_CHECK_TOKEN",
    "EMITTED_EVENT_VERSIONS_FILE",
  ].filter((name) => !env[name]);
  if (missing.length > 0) {
    logError(`${LOG_PREFIX}: ${missing.join(", ")} required`);
    return 1;
  }
  try {
    const emitted = await readEmittedVersions(EMITTED_EVENT_VERSIONS_FILE, readFile);
    const readable = await fetchReadableVersions({
      origin: PRODUCTION_ORIGIN,
      token: RELEASE_CHECK_TOKEN,
      fetchImpl,
    });
    const unreadable = unreadableVersions({ emitted, readable });
    if (unreadable.length > 0) {
      logError(`${LOG_PREFIX}: the register emits event versions production cannot read:`);
      for (const version of unreadable) {
        logError(`  ${version}`);
      }
      return 1;
    }
    log(`${LOG_PREFIX}: production reads all ${emitted.length} emitted event versions`);
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

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const LOG_PREFIX = "register-minimum-check";
const VERSION_MODULE_PATH = "packages/domain/src/sync/model/register-version.ts";
const REQUEST_TIMEOUT_MS = 30_000;

// The module is a single dependency-free file, so Node can run it as the raw TypeScript the
// commit holds.
export async function loadRegisterVersionModule(source) {
  const dir = await mkdtemp(join(tmpdir(), "register-version-"));
  try {
    const file = join(dir, "register-version.ts");
    await writeFile(file, source);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function readMinimumVersion({ sha, runGit, loadModule = loadRegisterVersionModule }) {
  const loaded = await loadModule(await runGit(["show", `${sha}:${VERSION_MODULE_PATH}`]));
  if (
    typeof loaded.MINIMUM_ACCEPTED_REGISTER_VERSION !== "string" ||
    typeof loaded.versionAtLeast !== "function"
  ) {
    throw new Error(
      `${LOG_PREFIX}: ${VERSION_MODULE_PATH} at ${sha} does not export MINIMUM_ACCEPTED_REGISTER_VERSION and versionAtLeast`,
    );
  }
  return {
    minimum: loaded.MINIMUM_ACCEPTED_REGISTER_VERSION,
    versionAtLeast: loaded.versionAtLeast,
  };
}

export function minimumIsRaised({ current, previous, versionAtLeast }) {
  return versionAtLeast(current, previous) && !versionAtLeast(previous, current);
}

function isRegisterListing(entry) {
  return (
    typeof entry === "object" &&
    entry !== null &&
    typeof entry.register_name === "string" &&
    (typeof entry.app_version === "string" || entry.app_version === null)
  );
}

export async function registersBelowMinimum({ origin, minimum, token, fetchImpl = fetch }) {
  const url = `${origin}/api/sync/registers-below-minimum?minimum=${encodeURIComponent(minimum)}`;
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      `${LOG_PREFIX}: GET registers-below-minimum failed: ${error instanceof Error ? error.message : error}`,
    );
  }
  if (response.status !== 200) {
    throw new Error(
      `${LOG_PREFIX}: GET registers-below-minimum answered status ${response.status}`,
    );
  }
  const body = await response.json().catch(() => undefined);
  if (!Array.isArray(body?.registers) || !body.registers.every(isRegisterListing)) {
    throw new Error(`${LOG_PREFIX}: GET registers-below-minimum answered a malformed body`);
  }
  return body.registers;
}

async function runGitViaChildProcess(args) {
  const { stdout } = await promisify(execFile)("git", args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

export async function runCli({
  env = process.env,
  runGit = runGitViaChildProcess,
  fetchImpl = fetch,
  log = console.log,
  logError = console.error,
} = {}) {
  const { TARGET_SHA, PREVIOUS_TAG, PRODUCTION_ORIGIN, RELEASE_CHECK_TOKEN } = env;
  if (!TARGET_SHA || !PRODUCTION_ORIGIN) {
    logError(`${LOG_PREFIX}: TARGET_SHA and PRODUCTION_ORIGIN are required`);
    return 1;
  }
  if (!PREVIOUS_TAG) {
    log(`${LOG_PREFIX}: no previous release, so no minimum is being raised`);
    return 0;
  }

  try {
    const previousSha = (await runGit(["rev-parse", `${PREVIOUS_TAG}^{commit}`])).trim();
    const current = await readMinimumVersion({ sha: TARGET_SHA, runGit });
    const previous = await readMinimumVersion({ sha: previousSha, runGit });
    if (
      !minimumIsRaised({
        current: current.minimum,
        previous: previous.minimum,
        versionAtLeast: current.versionAtLeast,
      })
    ) {
      log(
        `${LOG_PREFIX}: the minimum register version is not raised (${previous.minimum} to ${current.minimum})`,
      );
      return 0;
    }
    log(
      `${LOG_PREFIX}: the minimum register version rises from ${previous.minimum} to ${current.minimum}`,
    );
    if (!RELEASE_CHECK_TOKEN) {
      logError(
        `${LOG_PREFIX}: RELEASE_CHECK_TOKEN is required to ask production about its registers`,
      );
      return 1;
    }

    const registers = await registersBelowMinimum({
      origin: PRODUCTION_ORIGIN,
      minimum: current.minimum,
      token: RELEASE_CHECK_TOKEN,
      fetchImpl,
    });
    if (registers.length > 0) {
      logError(
        `${LOG_PREFIX}: ${registers.length} register(s) would stop synchronizing below ${current.minimum}:`,
      );
      for (const register of registers) {
        logError(`  ${register.register_name}: ${register.app_version ?? "never reported"}`);
      }
      return 1;
    }
    log(`${LOG_PREFIX}: no active register is below ${current.minimum}`);
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

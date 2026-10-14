import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { promisify } from "node:util";
import { releaseTagsNewestFirst } from "./release-version.mjs";

const LOG_PREFIX = "hardware-adapter-changes";
const TAG_PREFIX = "pos-v";
const SALES = "apps/pos/src/core/sales";

const PRINTER = "printer";
const SCALE = "scale";
const BARCODE_READER = "barcode reader";

const DEVICES = [PRINTER, SCALE, BARCODE_READER];

const ADAPTER_FOLDERS = [
  { folder: `${SALES}/receipt-printer/`, devices: [PRINTER] },
  { folder: `${SALES}/scale/`, devices: [SCALE] },
  { folder: `${SALES}/barcode-reader/`, devices: [BARCODE_READER] },
  { folder: `${SALES}/serial-link/`, devices: [SCALE, BARCODE_READER] },
];

export function devicesChanged(paths) {
  const changed = new Set(
    ADAPTER_FOLDERS.filter(({ folder }) => paths.some((path) => path.startsWith(folder))).flatMap(
      ({ devices }) => devices,
    ),
  );
  return DEVICES.filter((device) => changed.has(device));
}

export async function changedPaths({ sha, excludeTag, runGit }) {
  const tags = releaseTagsNewestFirst(
    (await runGit(["tag", "--list", `${TAG_PREFIX}*`, "--merged", sha])).split("\n"),
    TAG_PREFIX,
  ).filter((tag) => tag !== excludeTag);
  const [previousTag] = tags;
  const listing =
    previousTag === undefined
      ? await runGit(["log", "--name-only", "--format=", sha])
      : await runGit(["diff", "--name-only", `${previousTag}..${sha}`]);
  return [...new Set(listing.split("\n").filter((path) => path !== ""))].sort();
}

async function runGitViaChildProcess(args) {
  const { stdout } = await promisify(execFile)("git", args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

export async function runCli({
  argv = process.argv.slice(2),
  env = process.env,
  runGit = runGitViaChildProcess,
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const { TARGET_SHA, RELEASE_TAG, GITHUB_OUTPUT, HARDWARE_TEST } = env;
  if (!TARGET_SHA || !GITHUB_OUTPUT) {
    logError(`${LOG_PREFIX}: TARGET_SHA and GITHUB_OUTPUT are required`);
    return 1;
  }
  try {
    const paths = await changedPaths({
      sha: TARGET_SHA,
      excludeTag: RELEASE_TAG || undefined,
      runGit,
    });
    const devices = devicesChanged(paths);
    if (argv[0] === "gate" && devices.length > 0 && (HARDWARE_TEST ?? "").trim() === "") {
      logError(
        `${LOG_PREFIX}: this release changes the ${devices.join(", ")} adapter code and needs a recorded hands-on hardware test`,
      );
      return 1;
    }
    log(
      devices.length === 0
        ? `${LOG_PREFIX}: no hardware adapter changed`
        : `${LOG_PREFIX}: changed: ${devices.join(", ")}`,
    );
    await appendOutput(GITHUB_OUTPUT, `devices=${devices.join(",")}\n`);
    return 0;
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export async function productionBaseline() {
  return undefined;
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

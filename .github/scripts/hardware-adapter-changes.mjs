import { execFile } from "node:child_process";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  bucketFromEnv,
  readPublishedEntry as readPublishedEntryFromBucket,
} from "./publish-pos-update.mjs";
import {
  candidateImage,
  parseCandidateManifest,
  runNumberOfVersion,
} from "./register-candidate.mjs";

const LOG_PREFIX = "hardware-adapter-changes";
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

export async function changedPaths({ sha, baseline, runGit }) {
  const listing =
    baseline === undefined
      ? await runGit(["log", "--no-renames", "--name-only", "--format=", sha])
      : await runGit(["diff", "--no-renames", "--name-only", `${baseline}..${sha}`]);
  return [...new Set(listing.split("\n").filter((path) => path !== ""))].sort();
}

export async function productionBaseline({ servedVersion, readCandidateManifest }) {
  if (servedVersion === undefined) {
    return undefined;
  }
  const manifest = parseCandidateManifest(
    await readCandidateManifest(candidateImage(runNumberOfVersion(servedVersion))),
  );
  if (manifest.version !== servedVersion) {
    throw new Error(
      `${LOG_PREFIX}: production serves ${servedVersion}, but its candidate records ${manifest.version}`,
    );
  }
  return manifest.sha;
}

async function runGitViaChildProcess(args) {
  const { stdout } = await promisify(execFile)("git", args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function pullCandidateManifestWithOras(image) {
  const directory = await mkdtemp(join(tmpdir(), "register-candidate-"));
  try {
    await promisify(execFile)("oras", ["pull", image, "--output", directory]);
    return await readFile(join(directory, "candidate.json"), "utf8");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function parseDevices(text = "") {
  return text.split(",").filter((device) => device !== "");
}

function gate({ DEVICES: devicesText, HARDWARE_TEST }, { log, logError }) {
  const devices = parseDevices(devicesText);
  if (devices.length > 0 && (HARDWARE_TEST ?? "").trim() === "") {
    logError(
      `${LOG_PREFIX}: this release changes the ${devices.join(", ")} adapter code and needs a recorded hands-on hardware test`,
    );
    return 1;
  }
  log(`${LOG_PREFIX}: the release has the hardware test it needs`);
  return 0;
}

export async function runCli({
  argv = process.argv.slice(2),
  env = process.env,
  runGit = runGitViaChildProcess,
  readPublishedEntry = readPublishedEntryFromBucket,
  pullCandidateManifest = pullCandidateManifestWithOras,
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  if (argv[0] === "gate") {
    return gate(env, { log, logError });
  }
  const { TARGET_SHA, GITHUB_OUTPUT } = env;
  const { bucket, missing: missingBucket } = bucketFromEnv(env);
  const missing = [
    ...["TARGET_SHA", "GITHUB_OUTPUT"].filter((name) => !env[name]),
    ...missingBucket,
  ];
  if (missing.length > 0) {
    logError(`${LOG_PREFIX}: ${missing.join(", ")} required`);
    return 1;
  }
  try {
    const served = await readPublishedEntry({ bucket });
    const baseline = await productionBaseline({
      servedVersion: served?.version,
      readCandidateManifest: pullCandidateManifest,
    });
    log(
      baseline === undefined
        ? `${LOG_PREFIX}: production serves no register yet; comparing the whole history`
        : `${LOG_PREFIX}: comparing with ${baseline}, the commit of the register production serves`,
    );
    const devices = devicesChanged(await changedPaths({ sha: TARGET_SHA, baseline, runGit }));
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

if (import.meta.main) {
  runCli().then(
    (exitCode) => process.exit(exitCode),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}

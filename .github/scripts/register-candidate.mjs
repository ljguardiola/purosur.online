import {
  appendFile,
  readFile as readFileFromDisk,
  writeFile as writeFileToDisk,
} from "node:fs/promises";
import { basename } from "node:path";
import {
  findInstaller as findInstallerInDirectory,
  installerSha512 as installerSha512InDirectory,
} from "./publish-pos-update.mjs";

const LOG_PREFIX = "register-candidate";
const SHA_RE = /^[0-9a-f]{40}$/;
const RUN_NUMBER_RE = /^[1-9]\d*$/;
const INSTALLER_VERSION_RE = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.([1-9]\d*)$/;
const PACKAGE_VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const PRODUCTION_INSTALLER_NAME = "Puro Sur Setup";

export const CANDIDATE_REPOSITORY = "ghcr.io/ljguardiola/purosur-pos-candidate";

function assertRunNumber(runNumber) {
  if (!RUN_NUMBER_RE.test(String(runNumber))) {
    throw new Error(`${LOG_PREFIX}: ${JSON.stringify(runNumber)} is not a run number`);
  }
}

function assertSha(sha) {
  if (typeof sha !== "string" || !SHA_RE.test(sha)) {
    throw new Error(`${LOG_PREFIX}: ${JSON.stringify(sha)} is not a 40-character commit SHA`);
  }
}

export function assertInstallerVersion(version) {
  if (typeof version !== "string" || !INSTALLER_VERSION_RE.test(version)) {
    throw new Error(
      `${LOG_PREFIX}: ${JSON.stringify(version)} is not an installer version <major>.<minor>.<run number>`,
    );
  }
}

export function installerVersion({ packageVersion, runNumber }) {
  const match = typeof packageVersion === "string" ? PACKAGE_VERSION_RE.exec(packageVersion) : null;
  if (match === null) {
    throw new Error(
      `${LOG_PREFIX}: the register's package version ${JSON.stringify(packageVersion)} is not X.Y.Z`,
    );
  }
  assertRunNumber(runNumber);
  return `${match[1]}.${match[2]}.${runNumber}`;
}

function packageVersionOf(text) {
  try {
    return JSON.parse(text)?.version;
  } catch {
    throw new Error(`${LOG_PREFIX}: the register's package file is not JSON`);
  }
}

export function candidateImage(runNumber) {
  assertRunNumber(runNumber);
  return `${CANDIDATE_REPOSITORY}:${runNumber}`;
}

export function runNumberOfVersion(version) {
  assertInstallerVersion(version);
  return Number(INSTALLER_VERSION_RE.exec(version)[1]);
}

function assertDigest(digest) {
  if (typeof digest !== "string" || digest === "") {
    throw new Error(`${LOG_PREFIX}: ${JSON.stringify(digest)} is not an installer digest`);
  }
}

export function candidateManifest({ sha, version, stagingInstallerSha512 }) {
  assertSha(sha);
  assertInstallerVersion(version);
  assertDigest(stagingInstallerSha512);
  return `${JSON.stringify({ sha, version, staging_installer_sha512: stagingInstallerSha512 }, null, 2)}\n`;
}

export function parseCandidateManifest(text) {
  let manifest;
  try {
    manifest = JSON.parse(text);
    assertSha(manifest?.sha);
    assertInstallerVersion(manifest.version);
    assertDigest(manifest.staging_installer_sha512);
  } catch {
    throw new Error(`${LOG_PREFIX}: the candidate manifest is malformed`);
  }
  return {
    sha: manifest.sha,
    version: manifest.version,
    stagingInstallerSha512: manifest.staging_installer_sha512,
  };
}

const isSuccessfulPushOnMain = (run) =>
  run.event === "push" && run.headBranch === "main" && run.conclusion === "success";

export function commitOfRun(runs, runNumber) {
  const run = runs.find((candidate) => candidate.number === runNumber);
  if (run === undefined) {
    throw new Error(`${LOG_PREFIX}: no run ${runNumber} among the listed runs`);
  }
  if (run.event !== "push") {
    throw new Error(`${LOG_PREFIX}: run ${runNumber} was not a push`);
  }
  if (run.headBranch !== "main") {
    throw new Error(`${LOG_PREFIX}: run ${runNumber} was not on main`);
  }
  if (run.conclusion !== "success") {
    throw new Error(`${LOG_PREFIX}: run ${runNumber} did not succeed`);
  }
  return run.headSha;
}

export function runOfCommit(runs, sha) {
  const numbers = runs
    .filter((run) => run.headSha === sha && isSuccessfulPushOnMain(run))
    .map((run) => run.number);
  if (numbers.length === 0) {
    throw new Error(`${LOG_PREFIX}: no successful push run on main packaged ${sha}`);
  }
  return Math.max(...numbers);
}

function joinSections(sections) {
  return `${sections.filter((section) => section !== "").join("\n\n")}\n`;
}

export function hardwareTestNotes({ body, devices, hardwareTest }) {
  const sections = [body.trimEnd()];
  const required = `## Hardware test required: ${devices.join(", ")}`;
  if (devices.length > 0 && !body.split("\n").includes(required)) {
    sections.push(required);
  }
  if (hardwareTest.trim() !== "") {
    sections.push(`## Hardware test\n\n${hardwareTest.trim()}`);
  }
  return joinSections(sections);
}

function parseRuns(text) {
  let runs;
  try {
    runs = JSON.parse(text);
  } catch {
    runs = undefined;
  }
  if (!Array.isArray(runs)) {
    throw new Error(`${LOG_PREFIX}: the listed runs are not a JSON array`);
  }
  return runs;
}

const COMMANDS = new Map(
  Object.entries({
    "installer-version": {
      needs: ["RUN_NUMBER", "PACKAGE_JSON_FILE"],
      async run({ RUN_NUMBER, PACKAGE_JSON_FILE }, { readFile }) {
        const packageVersion = packageVersionOf(await readFile(PACKAGE_JSON_FILE));
        return `version=${installerVersion({ packageVersion, runNumber: RUN_NUMBER })}\n`;
      },
    },
    "installer-of-version": {
      needs: ["INSTALLER_DIR", "POS_VERSION"],
      async run({ INSTALLER_DIR, POS_VERSION }, { findInstaller }) {
        assertInstallerVersion(POS_VERSION);
        const expected = `${PRODUCTION_INSTALLER_NAME} ${POS_VERSION}.exe`;
        const path = await findInstaller(INSTALLER_DIR);
        if (basename(path) !== expected) {
          throw new Error(`${LOG_PREFIX}: the installer is ${basename(path)}, not ${expected}`);
        }
        return `asset=${path}#${expected}\n`;
      },
    },
    "run-of-version": {
      needs: ["INSTALLER_VERSION"],
      async run({ INSTALLER_VERSION }) {
        const runNumber = runNumberOfVersion(INSTALLER_VERSION);
        return `run_number=${runNumber}\nimage=${candidateImage(runNumber)}\n`;
      },
    },
    "commit-of-run": {
      needs: ["RUN_NUMBER", "RUNS_FILE"],
      async run({ RUN_NUMBER, RUNS_FILE }, { readFile }) {
        assertRunNumber(RUN_NUMBER);
        return `sha=${commitOfRun(parseRuns(await readFile(RUNS_FILE)), Number(RUN_NUMBER))}\n`;
      },
    },
    "run-of-commit": {
      needs: ["TARGET_SHA", "RUNS_FILE"],
      async run({ TARGET_SHA, RUNS_FILE }, { readFile }) {
        assertSha(TARGET_SHA);
        const runNumber = runOfCommit(parseRuns(await readFile(RUNS_FILE)), TARGET_SHA);
        return `run_number=${runNumber}\nimage=${candidateImage(runNumber)}\n`;
      },
    },
    "write-manifest": {
      needs: ["TARGET_SHA", "POS_VERSION", "MANIFEST_FILE", "STAGING_INSTALLER_DIR"],
      async run(
        { TARGET_SHA, POS_VERSION, MANIFEST_FILE, STAGING_INSTALLER_DIR },
        { writeFile, installerSha512 },
      ) {
        await writeFile(
          MANIFEST_FILE,
          candidateManifest({
            sha: TARGET_SHA,
            version: POS_VERSION,
            stagingInstallerSha512: await installerSha512(STAGING_INSTALLER_DIR),
          }),
        );
        return "";
      },
    },
    "hardware-test-notes": {
      needs: ["RELEASE_BODY_FILE"],
      async run({ RELEASE_BODY_FILE, DEVICES = "", HARDWARE_TEST = "" }, { readFile, writeFile }) {
        const body = await readFile(RELEASE_BODY_FILE);
        const devices = DEVICES.split(",").filter((device) => device !== "");
        await writeFile(
          RELEASE_BODY_FILE,
          hardwareTestNotes({ body, devices, hardwareTest: HARDWARE_TEST }),
        );
        return "";
      },
    },
    "read-manifest": {
      needs: ["MANIFEST_FILE"],
      async run(
        { MANIFEST_FILE, EXPECTED_SHA, EXPECTED_STAGING_INSTALLER_SHA512, RELEASE_TAG },
        { readFile },
      ) {
        const { sha, version, stagingInstallerSha512 } = parseCandidateManifest(
          await readFile(MANIFEST_FILE),
        );
        if (EXPECTED_SHA && sha !== EXPECTED_SHA) {
          throw new Error(
            `${LOG_PREFIX}: the candidate was built from ${sha}, not the expected commit ${EXPECTED_SHA}`,
          );
        }
        if (
          EXPECTED_STAGING_INSTALLER_SHA512 &&
          stagingInstallerSha512 !== EXPECTED_STAGING_INSTALLER_SHA512
        ) {
          throw new Error(
            `${LOG_PREFIX}: the candidate's staging installer is not the one the staging feed serves`,
          );
        }
        if (RELEASE_TAG && RELEASE_TAG !== `pos-v${version}`) {
          throw new Error(
            `${LOG_PREFIX}: the candidate's installer version ${version} is not the one ${RELEASE_TAG} names`,
          );
        }
        return `sha=${sha}\nversion=${version}\n`;
      },
    },
  }),
);

export async function runCli({
  argv = process.argv.slice(2),
  env = process.env,
  readFile = (path) => readFileFromDisk(path, "utf8"),
  writeFile = writeFileToDisk,
  installerSha512 = installerSha512InDirectory,
  findInstaller = findInstallerInDirectory,
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const command = COMMANDS.get(argv[0]);
  if (command === undefined) {
    logError(`${LOG_PREFIX}: the command must be one of ${[...COMMANDS.keys()].join(", ")}`);
    return 1;
  }
  const missing = ["GITHUB_OUTPUT", ...command.needs].filter((name) => !env[name]);
  if (missing.length > 0) {
    logError(`${LOG_PREFIX}: ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} required`);
    return 1;
  }
  try {
    const output = await command.run(env, { readFile, writeFile, installerSha512, findInstaller });
    log(`${LOG_PREFIX}: ${argv[0]} done`);
    if (output !== "") {
      await appendOutput(env.GITHUB_OUTPUT, output);
    }
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

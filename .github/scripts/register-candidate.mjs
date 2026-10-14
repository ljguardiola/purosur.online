import {
  appendFile,
  readFile as readFileFromDisk,
  writeFile as writeFileToDisk,
} from "node:fs/promises";

const LOG_PREFIX = "register-candidate";
const SHA_RE = /^[0-9a-f]{40}$/;
const RUN_NUMBER_RE = /^[1-9]\d*$/;
const INSTALLER_VERSION_RE = /^0\.0\.([1-9]\d*)$/;

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

function assertInstallerVersion(version) {
  if (typeof version !== "string" || !INSTALLER_VERSION_RE.test(version)) {
    throw new Error(`${LOG_PREFIX}: ${JSON.stringify(version)} is not an installer version 0.0.N`);
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

export function candidateManifest({ sha, version }) {
  assertSha(sha);
  assertInstallerVersion(version);
  return `${JSON.stringify({ sha, version }, null, 2)}\n`;
}

export function parseCandidateManifest(text) {
  let manifest;
  try {
    manifest = JSON.parse(text);
    assertSha(manifest?.sha);
    assertInstallerVersion(manifest.version);
  } catch {
    throw new Error(`${LOG_PREFIX}: the candidate manifest is malformed`);
  }
  return { sha: manifest.sha, version: manifest.version };
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

const COMMANDS = {
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
    needs: ["TARGET_SHA", "POS_VERSION", "MANIFEST_FILE"],
    async run({ TARGET_SHA, POS_VERSION, MANIFEST_FILE }, { writeFile }) {
      await writeFile(MANIFEST_FILE, candidateManifest({ sha: TARGET_SHA, version: POS_VERSION }));
      return "";
    },
  },
  "read-manifest": {
    needs: ["MANIFEST_FILE"],
    async run({ MANIFEST_FILE }, { readFile }) {
      const { sha, version } = parseCandidateManifest(await readFile(MANIFEST_FILE));
      return `sha=${sha}\nversion=${version}\n`;
    },
  },
};

export async function runCli({
  argv = process.argv.slice(2),
  env = process.env,
  readFile = (path) => readFileFromDisk(path, "utf8"),
  writeFile = writeFileToDisk,
  appendOutput = appendFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const command = COMMANDS[argv[0]];
  if (command === undefined) {
    logError(`${LOG_PREFIX}: the command must be one of ${Object.keys(COMMANDS).join(", ")}`);
    return 1;
  }
  const missing = ["GITHUB_OUTPUT", ...command.needs].filter((name) => !env[name]);
  if (missing.length > 0) {
    logError(`${LOG_PREFIX}: ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} required`);
    return 1;
  }
  try {
    const output = await command.run(env, { readFile, writeFile });
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

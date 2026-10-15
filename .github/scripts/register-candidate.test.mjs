import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  candidateImage,
  candidateManifest,
  commitOfRun,
  hardwareTestNotes,
  parseCandidateManifest,
  registerReleaseNotes,
  runCli,
  runNumberOfVersion,
  runOfCommit,
} from "./register-candidate.mjs";

const SHA = "a1".repeat(20);
const OTHER_SHA = "b2".repeat(20);
const STAGING_SHA512 = createHash("sha512").update("staging installer").digest("base64");
const OTHER_SHA512 = createHash("sha512").update("another installer").digest("base64");
const MANIFEST = { sha: SHA, version: "0.0.57", stagingInstallerSha512: STAGING_SHA512 };

function run(overrides) {
  return {
    number: 57,
    headSha: SHA,
    headBranch: "main",
    event: "push",
    conclusion: "success",
    ...overrides,
  };
}

test("names the candidate image after the run that built it", () => {
  assert.equal(candidateImage(57), "ghcr.io/ljguardiola/purosur-pos-candidate:57");
  assert.equal(candidateImage("57"), "ghcr.io/ljguardiola/purosur-pos-candidate:57");
});

test("refuses a run number that is not a positive integer", () => {
  for (const number of [0, -1, 1.5, "abc", "07", "", undefined, "5 7"]) {
    assert.throws(() => candidateImage(number), /run number/);
  }
});

test("reads the run number out of an installer version 0.0.N", () => {
  assert.equal(runNumberOfVersion("0.0.57"), 57);
});

test("refuses an installer version that is not 0.0.N", () => {
  for (const version of [
    "1.0.57",
    "0.1.57",
    "0.0.0",
    "0.0.057",
    "0.0",
    "0.0.5.7",
    "x",
    "",
    undefined,
  ]) {
    assert.throws(() => runNumberOfVersion(version), /0\.0\.N/);
  }
});

test("records the commit, the installer version and the staging installer's digest, and reads them back", () => {
  const text = candidateManifest(MANIFEST);

  assert.deepEqual(parseCandidateManifest(text), MANIFEST);
});

test("refuses to record a commit that is not 40 hexadecimal characters, a bad version or no digest", () => {
  assert.throws(() => candidateManifest({ ...MANIFEST, sha: "abc" }), /40/);
  assert.throws(() => candidateManifest({ ...MANIFEST, version: "1.2.3" }), /0\.0\.N/);
  assert.throws(() => candidateManifest({ ...MANIFEST, stagingInstallerSha512: "" }), /digest/);
});

test("refuses a recorded manifest that is not what the packaging run writes", () => {
  for (const text of [
    "not json",
    "null",
    "[]",
    JSON.stringify({ sha: SHA, staging_installer_sha512: STAGING_SHA512 }),
    JSON.stringify({ version: "0.0.57", staging_installer_sha512: STAGING_SHA512 }),
    JSON.stringify({ sha: SHA, version: "0.0.57" }),
    JSON.stringify({ sha: SHA, version: "0.0.57", staging_installer_sha512: 7 }),
    JSON.stringify({ sha: "abc", version: "0.0.57", staging_installer_sha512: STAGING_SHA512 }),
    JSON.stringify({ sha: SHA, version: "2.0.0", staging_installer_sha512: STAGING_SHA512 }),
  ]) {
    assert.throws(() => parseCandidateManifest(text), /candidate manifest/);
  }
});

test("finds the commit of a successful push run on main", () => {
  assert.equal(commitOfRun([run({ number: 56, headSha: OTHER_SHA }), run()], 57), SHA);
});

test("refuses a run that is missing, is not a push on main, or did not succeed", () => {
  assert.throws(() => commitOfRun([run({ number: 56 })], 57), /no run 57/);
  assert.throws(() => commitOfRun([run({ event: "pull_request" })], 57), /push/);
  assert.throws(() => commitOfRun([run({ headBranch: "feature" })], 57), /main/);
  assert.throws(() => commitOfRun([run({ conclusion: "failure" })], 57), /succeed/);
  assert.throws(() => commitOfRun([run({ conclusion: "" })], 57), /succeed/);
});

test("finds the run number of a commit's successful push run on main", () => {
  assert.equal(runOfCommit([run({ number: 12, headSha: OTHER_SHA }), run()], SHA), 57);
});

test("takes the newest run when a commit was packaged more than once", () => {
  assert.equal(runOfCommit([run({ number: 58 }), run({ number: 57 })], SHA), 58);
});

test("ignores runs of the commit that are not successful pushes on main", () => {
  const runs = [
    run({ number: 60, event: "pull_request" }),
    run({ number: 59, conclusion: "failure" }),
    run({ number: 58, headBranch: "feature" }),
    run({ number: 57 }),
  ];

  assert.equal(runOfCommit(runs, SHA), 57);
});

test("refuses a commit that no successful run packaged", () => {
  assert.throws(() => runOfCommit([run({ headSha: OTHER_SHA })], SHA), /no successful/);
  assert.throws(() => runOfCommit([], SHA), /no successful/);
});

function cliHarness(env, files = {}, installers = {}) {
  const outputs = [];
  const errors = [];
  const written = {};
  return {
    outputs,
    errors,
    written,
    options: {
      env: { GITHUB_OUTPUT: "out", ...env },
      readFile: async (path) => {
        if (!(path in files)) throw new Error(`no file ${path}`);
        return files[path];
      },
      writeFile: async (path, text) => {
        written[path] = text;
      },
      installerSha512: async (directory) => {
        if (!(directory in installers)) throw new Error(`no installer in ${directory}`);
        return installers[directory];
      },
      appendOutput: async (_path, text) => {
        outputs.push(text);
      },
      log: () => {},
      logError: (message) => errors.push(message),
    },
  };
}

test("the CLI turns an installer version into its run number and image", async () => {
  const harness = cliHarness({ INSTALLER_VERSION: "0.0.57" });

  assert.equal(await runCli({ ...harness.options, argv: ["run-of-version"] }), 0);
  assert.deepEqual(harness.outputs, [
    "run_number=57\nimage=ghcr.io/ljguardiola/purosur-pos-candidate:57\n",
  ]);
});

test("the CLI refuses a version that is not 0.0.N", async () => {
  const harness = cliHarness({ INSTALLER_VERSION: "1.0.0" });

  assert.equal(await runCli({ ...harness.options, argv: ["run-of-version"] }), 1);
  assert.match(harness.errors.join("\n"), /0\.0\.N/);
  assert.deepEqual(harness.outputs, []);
});

test("the CLI names the commit of a run from the listed runs", async () => {
  const harness = cliHarness(
    { RUN_NUMBER: "57", RUNS_FILE: "runs.json" },
    { "runs.json": JSON.stringify([run()]) },
  );

  assert.equal(await runCli({ ...harness.options, argv: ["commit-of-run"] }), 0);
  assert.deepEqual(harness.outputs, [`sha=${SHA}\n`]);
});

test("the CLI names the run and image of a commit from the listed runs", async () => {
  const harness = cliHarness(
    { TARGET_SHA: SHA, RUNS_FILE: "runs.json" },
    { "runs.json": JSON.stringify([run()]) },
  );

  assert.equal(await runCli({ ...harness.options, argv: ["run-of-commit"] }), 0);
  assert.deepEqual(harness.outputs, [
    "run_number=57\nimage=ghcr.io/ljguardiola/purosur-pos-candidate:57\n",
  ]);
});

test("the CLI refuses runs that are not JSON", async () => {
  const harness = cliHarness({ TARGET_SHA: SHA, RUNS_FILE: "runs.json" }, { "runs.json": "oops" });

  assert.equal(await runCli({ ...harness.options, argv: ["run-of-commit"] }), 1);
  assert.match(harness.errors.join("\n"), /runs/);
});

test("the CLI writes the manifest with the staging installer's digest and reads it back into outputs", async () => {
  const writing = cliHarness(
    {
      TARGET_SHA: SHA,
      POS_VERSION: "0.0.57",
      MANIFEST_FILE: "m.json",
      STAGING_INSTALLER_DIR: "staging-installer",
    },
    {},
    { "staging-installer": STAGING_SHA512 },
  );
  assert.equal(await runCli({ ...writing.options, argv: ["write-manifest"] }), 0);
  assert.deepEqual(parseCandidateManifest(writing.written["m.json"]), MANIFEST);

  const reading = cliHarness({ MANIFEST_FILE: "m.json" }, { "m.json": writing.written["m.json"] });
  assert.equal(await runCli({ ...reading.options, argv: ["read-manifest"] }), 0);
  assert.deepEqual(reading.outputs, [`sha=${SHA}\nversion=0.0.57\n`]);
});

test("the CLI refuses the name of a property every object has as a command", async () => {
  for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    const harness = cliHarness({});

    assert.equal(await runCli({ ...harness.options, argv: [name] }), 1, name);
    assert.match(harness.errors.join("\n"), /command/);
  }
});

test("the CLI refuses writing a manifest without the staging installer", async () => {
  const harness = cliHarness({ TARGET_SHA: SHA, POS_VERSION: "0.0.57", MANIFEST_FILE: "m.json" });

  assert.equal(await runCli({ ...harness.options, argv: ["write-manifest"] }), 1);
  assert.match(harness.errors.join("\n"), /STAGING_INSTALLER_DIR/);
  assert.deepEqual(harness.written, {});
});

test("the CLI names what is missing and refuses an unknown command", async () => {
  const missing = cliHarness({});
  assert.equal(await runCli({ ...missing.options, argv: ["run-of-version"] }), 1);
  assert.match(missing.errors.join("\n"), /INSTALLER_VERSION/);

  const unknown = cliHarness({});
  assert.equal(await runCli({ ...unknown.options, argv: ["other"] }), 1);
  assert.match(unknown.errors.join("\n"), /command/);

  const noOutput = cliHarness({ INSTALLER_VERSION: "0.0.1", GITHUB_OUTPUT: "" });
  assert.equal(await runCli({ ...noOutput.options, argv: ["run-of-version"] }), 1);
  assert.match(noOutput.errors.join("\n"), /GITHUB_OUTPUT/);
});

test("adds the installer version to the release notes", () => {
  assert.equal(
    registerReleaseNotes({ notes: "## Features\n\n- a\n", version: "0.0.57" }),
    "## Features\n\n- a\n\nInstaller version 0.0.57\n",
  );
});

test("the CLI appends the installer version to the notes file, whatever devices it is given", async () => {
  const harness = cliHarness(
    { RELEASE_NOTES_FILE: "notes.md", INSTALLER_VERSION: "0.0.57", DEVICES: "printer,scale" },
    { "notes.md": "- a\n" },
  );

  assert.equal(await runCli({ ...harness.options, argv: ["release-notes"] }), 0);
  assert.equal(harness.written["notes.md"], "- a\n\nInstaller version 0.0.57\n");
});

test("flags the devices to test by hand in the release notes", () => {
  assert.equal(
    hardwareTestNotes({ body: "- a\n", devices: ["printer", "scale"], hardwareTest: "" }),
    "- a\n\n## Hardware test required: printer, scale\n",
  );
});

test("flags the devices once when the notes already flag them", () => {
  const body = "- a\n\n## Hardware test required: printer, scale\n";

  assert.equal(hardwareTestNotes({ body, devices: ["printer", "scale"], hardwareTest: "" }), body);
});

test("records the hands-on hardware test after the flagged devices", () => {
  assert.equal(
    hardwareTestNotes({
      body: "- a\n\nInstaller version 0.0.57\n",
      devices: ["printer"],
      hardwareTest: " 2026-10-14, Ana: printed 3 receipts \n",
    }),
    "- a\n\nInstaller version 0.0.57\n\n## Hardware test required: printer\n\n## Hardware test\n\n2026-10-14, Ana: printed 3 receipts\n",
  );
});

test("leaves the notes as they are with no device flagged and no hardware test", () => {
  assert.equal(hardwareTestNotes({ body: "- a\n", devices: [], hardwareTest: "  \n" }), "- a\n");
});

test("the CLI writes the flagged devices and the hardware test into the release body file", async () => {
  const harness = cliHarness(
    {
      RELEASE_BODY_FILE: "body.md",
      DEVICES: "printer,barcode reader",
      HARDWARE_TEST: "Ana, 2026-10-14: all fine",
    },
    { "body.md": "- a\n" },
  );

  assert.equal(await runCli({ ...harness.options, argv: ["hardware-test-notes"] }), 0);
  assert.equal(
    harness.written["body.md"],
    "- a\n\n## Hardware test required: printer, barcode reader\n\n## Hardware test\n\nAna, 2026-10-14: all fine\n",
  );
});

test("the CLI refuses a candidate whose staging installer is not the one the staging feed serves", async () => {
  const manifest = candidateManifest(MANIFEST);
  const matching = cliHarness(
    {
      MANIFEST_FILE: "m.json",
      EXPECTED_SHA: SHA,
      EXPECTED_STAGING_INSTALLER_SHA512: STAGING_SHA512,
    },
    { "m.json": manifest },
  );
  const other = cliHarness(
    { MANIFEST_FILE: "m.json", EXPECTED_SHA: SHA, EXPECTED_STAGING_INSTALLER_SHA512: OTHER_SHA512 },
    { "m.json": manifest },
  );

  assert.equal(await runCli({ ...matching.options, argv: ["read-manifest"] }), 0);
  assert.equal(await runCli({ ...other.options, argv: ["read-manifest"] }), 1);
  assert.match(other.errors.join("\n"), /staging installer/);
  assert.deepEqual(other.outputs, []);
});

test("the CLI refuses a manifest whose commit is not the one expected", async () => {
  const manifest = candidateManifest(MANIFEST);
  const matching = cliHarness(
    { MANIFEST_FILE: "m.json", EXPECTED_SHA: SHA },
    { "m.json": manifest },
  );
  const other = cliHarness(
    { MANIFEST_FILE: "m.json", EXPECTED_SHA: OTHER_SHA },
    { "m.json": manifest },
  );

  assert.equal(await runCli({ ...matching.options, argv: ["read-manifest"] }), 0);
  assert.equal(await runCli({ ...other.options, argv: ["read-manifest"] }), 1);
  assert.match(other.errors.join("\n"), /not the expected commit/);
  assert.deepEqual(other.outputs, []);
});

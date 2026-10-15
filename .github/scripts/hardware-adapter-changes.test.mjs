import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  changedPaths,
  devicesChanged,
  productionBaseline,
  runCli,
} from "./hardware-adapter-changes.mjs";
import { candidateImage, candidateManifest } from "./register-candidate.mjs";

const SALES = "apps/pos/src/core/sales";
const STAGING_SHA512 = createHash("sha512").update("staging installer").digest("base64");

test("reports no device when no hardware adapter folder changed", () => {
  assert.deepEqual(devicesChanged([`${SALES}/sell.ts`, "apps/cloud/src/a.ts"]), []);
  assert.deepEqual(devicesChanged([]), []);
});

test("reports the device of each hardware adapter folder", () => {
  assert.deepEqual(devicesChanged([`${SALES}/receipt-printer/pc850.ts`]), ["printer"]);
  assert.deepEqual(devicesChanged([`${SALES}/scale/systel-scale.ts`]), ["scale"]);
  assert.deepEqual(devicesChanged([`${SALES}/barcode-reader/barcode-reader-lines.ts`]), [
    "barcode reader",
  ]);
});

test("reports both devices that share the serial link", () => {
  assert.deepEqual(devicesChanged([`${SALES}/serial-link/open-serial-link.ts`]), [
    "scale",
    "barcode reader",
  ]);
});

test("lists each device once, in a fixed order", () => {
  assert.deepEqual(
    devicesChanged([
      `${SALES}/serial-link/open-serial-link.ts`,
      `${SALES}/barcode-reader/serial-barcode-reader.ts`,
      `${SALES}/scale/systel-scale.ts`,
      `${SALES}/receipt-printer/tcp-receipt-printer.ts`,
      `${SALES}/receipt-printer/pc850.ts`,
    ]),
    ["printer", "scale", "barcode reader"],
  );
});

test("does not mistake a similarly named folder or file for an adapter folder", () => {
  assert.deepEqual(
    devicesChanged([
      `${SALES}/receipt-printer-queue/x.ts`,
      `${SALES}/receipt-printer.ts`,
      `other/${SALES}/scale/x.ts`,
    ]),
    [],
  );
});

async function withRepo(run) {
  const dir = mkdtempSync(join(tmpdir(), "hardware-adapter-changes-"));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
  const commit = (message, files) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(dir, dirname(path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    git("add", "-A");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.test",
      "commit",
      "-q",
      "-m",
      message,
    );
    return git("rev-parse", "HEAD");
  };
  git("init", "-q", "-b", "main");
  try {
    return await run({ git, commit, runGit: async (args) => git(...args) });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("measures from the commit of the candidate production serves", async () => {
  await withRepo(async ({ commit, runGit }) => {
    commit("old", { [`${SALES}/scale/systel-scale.ts`]: "1" });
    const served = commit("served", { [`${SALES}/serial-link/open-serial-link.ts`]: "1" });
    const sha = commit("new", { [`${SALES}/receipt-printer/pc850.ts`]: "1", "README.md": "x" });

    assert.deepEqual(await changedPaths({ sha, baseline: served, runGit }), [
      "README.md",
      `${SALES}/receipt-printer/pc850.ts`,
    ]);
  });
});

test("covers the whole history when production serves no register yet", async () => {
  await withRepo(async ({ commit, runGit }) => {
    commit("first", { [`${SALES}/scale/systel-scale.ts`]: "1" });
    const sha = commit("second", { "README.md": "x" });

    assert.deepEqual(await changedPaths({ sha, baseline: undefined, runGit }), [
      "README.md",
      `${SALES}/scale/systel-scale.ts`,
    ]);
  });
});

test("lists a file moved out of an adapter folder under the folder it left", async () => {
  await withRepo(async ({ git, commit, runGit }) => {
    const served = commit("served", {
      [`${SALES}/scale/systel-scale.ts`]: "export const scale = 1;\n",
    });
    git("mv", `${SALES}/scale/systel-scale.ts`, `${SALES}/weighing.ts`);
    const sha = commit("move", {});

    const paths = await changedPaths({ sha, baseline: served, runGit });

    assert.deepEqual(devicesChanged(paths), ["scale"]);
  });
});

function manifestOf(sha, version) {
  return candidateManifest({ sha, version, stagingInstallerSha512: STAGING_SHA512 });
}

test("the baseline is the commit recorded in the candidate of the version production serves", async () => {
  const sha = "c3".repeat(20);
  const pulled = [];

  const baseline = await productionBaseline({
    servedVersion: "0.0.41",
    readCandidateManifest: async (image) => {
      pulled.push(image);
      return manifestOf(sha, "0.0.41");
    },
  });

  assert.equal(baseline, sha);
  assert.deepEqual(pulled, [candidateImage(41)]);
});

test("there is no baseline when production serves no register yet", async () => {
  const baseline = await productionBaseline({
    servedVersion: undefined,
    readCandidateManifest: async () => {
      throw new Error("no candidate is read");
    },
  });

  assert.equal(baseline, undefined);
});

test("refuses a baseline it cannot resolve", async () => {
  const sha = "c3".repeat(20);
  for (const [servedVersion, readCandidateManifest, message] of [
    ["1.2.3", async () => manifestOf(sha, "0.0.41"), /0\.0\.N/],
    ["0.0.41", async () => manifestOf(sha, "0.0.42"), /0\.0\.42/],
    ["0.0.41", async () => "not json", /candidate manifest/],
    [
      "0.0.41",
      async () => {
        throw new Error("the candidate could not be pulled");
      },
      /could not be pulled/,
    ],
  ]) {
    await assert.rejects(productionBaseline({ servedVersion, readCandidateManifest }), message);
  }
});

const SECRET_ACCESS_KEY = "fictional-bucket-secret";

const BUCKET_ENV = {
  POS_UPDATES_BUCKET_ENDPOINT: "https://storage.example.test",
  POS_UPDATES_BUCKET_NAME: "register-updates",
  POS_UPDATES_BUCKET_REGION: "auto",
  POS_UPDATES_BUCKET_ACCESS_KEY_ID: "fictional-access-key-id",
  POS_UPDATES_BUCKET_SECRET_ACCESS_KEY: SECRET_ACCESS_KEY,
};

function cliHarness({ sha, runGit, served, candidates = {}, env = {} }) {
  const outputs = [];
  const errors = [];
  const buckets = [];
  return {
    outputs,
    errors,
    buckets,
    options: {
      env: { TARGET_SHA: sha, GITHUB_OUTPUT: "out", ...BUCKET_ENV, ...env },
      runGit,
      readPublishedEntry: async ({ bucket }) => {
        buckets.push(bucket);
        return served === undefined
          ? undefined
          : { version: served, file: "Puro Sur Setup.exe", size: 1, sha512: STAGING_SHA512 };
      },
      pullCandidateManifest: async (image) => {
        if (!(image in candidates)) throw new Error(`no candidate ${image}`);
        return candidates[image];
      },
      appendOutput: async (_path, text) => outputs.push(text),
      log: () => {},
      logError: (message) => errors.push(message),
    },
  };
}

test("the CLI flags a device changed since production's register even when a later release was refused", async () => {
  await withRepo(async ({ git, commit, runGit }) => {
    const served = commit("served", { "README.md": "1" });
    git("tag", "pos-v1.0.0");
    commit("refused", { [`${SALES}/scale/systel-scale.ts`]: "1" });
    git("tag", "pos-v1.1.0");
    const sha = commit("released", { "README.md": "2" });
    git("tag", "pos-v1.2.0");
    const harness = cliHarness({
      sha,
      runGit,
      served: "0.0.5",
      candidates: { [candidateImage(5)]: manifestOf(served, "0.0.5") },
    });

    assert.equal(await runCli(harness.options), 0);
    assert.deepEqual(harness.outputs, ["devices=scale\n"]);
    assert.equal(harness.buckets[0].name, BUCKET_ENV.POS_UPDATES_BUCKET_NAME);
  });
});

test("the CLI covers the whole history when production serves no register yet", async () => {
  await withRepo(async ({ commit, runGit }) => {
    commit("first", { [`${SALES}/receipt-printer/pc850.ts`]: "1" });
    const sha = commit("second", { "README.md": "2" });
    const harness = cliHarness({ sha, runGit, served: undefined });

    assert.equal(await runCli(harness.options), 0);
    assert.deepEqual(harness.outputs, ["devices=printer\n"]);
  });
});

test("the CLI outputs no device when none changed since production's register", async () => {
  await withRepo(async ({ commit, runGit }) => {
    commit("first", { [`${SALES}/receipt-printer/pc850.ts`]: "1" });
    const served = commit("served", { "README.md": "1" });
    const sha = commit("released", { "README.md": "2" });
    const harness = cliHarness({
      sha,
      runGit,
      served: "0.0.5",
      candidates: { [candidateImage(5)]: manifestOf(served, "0.0.5") },
    });

    assert.equal(await runCli(harness.options), 0);
    assert.deepEqual(harness.outputs, ["devices=\n"]);
  });
});

test("the CLI refuses when the candidate production serves cannot be resolved", async () => {
  await withRepo(async ({ commit, runGit }) => {
    const sha = commit("released", { "README.md": "2" });
    for (const candidates of [{}, { [candidateImage(5)]: manifestOf("d4".repeat(20), "0.0.5") }]) {
      const harness = cliHarness({ sha, runGit, served: "0.0.5", candidates });

      assert.equal(await runCli(harness.options), 1);
      assert.deepEqual(harness.outputs, []);
    }
  });
});

test("the CLI names what is missing and never prints the secret", async () => {
  const harness = cliHarness({
    sha: "",
    runGit: async () => "",
    env: { POS_UPDATES_BUCKET_NAME: "" },
  });

  assert.equal(await runCli(harness.options), 1);
  const output = harness.errors.join("\n");
  assert.match(output, /TARGET_SHA/);
  assert.match(output, /POS_UPDATES_BUCKET_NAME/);
  assert.doesNotMatch(output, new RegExp(BUCKET_ENV.POS_UPDATES_BUCKET_SECRET_ACCESS_KEY));
});

function gateOptions(env) {
  const errors = [];
  return {
    errors,
    options: {
      argv: ["gate"],
      env,
      log: () => {},
      logError: (message) => errors.push(message),
    },
  };
}

test("the gate refuses a release that changes a device when no hardware test is given", async () => {
  for (const hardwareTest of [undefined, "", "  \n"]) {
    const gate = gateOptions({ DEVICES: "printer,scale", HARDWARE_TEST: hardwareTest });

    assert.equal(await runCli(gate.options), 1);
    assert.match(gate.errors.join("\n"), /printer, scale/);
  }
});

test("the gate passes a release that changes a device once a hardware test is given", async () => {
  const gate = gateOptions({ DEVICES: "printer", HARDWARE_TEST: "Ana, 2026-10-14: ok" });

  assert.equal(await runCli(gate.options), 0);
});

test("the gate passes a release that changes no device without a hardware test", async () => {
  const gate = gateOptions({ DEVICES: "" });

  assert.equal(await runCli(gate.options), 0);
});

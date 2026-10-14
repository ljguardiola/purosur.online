import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { changedPaths, devicesChanged, runCli } from "./hardware-adapter-changes.mjs";

const SALES = "apps/pos/src/core/sales";

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

test("compares with the newest register release tag the commit contains", async () => {
  await withRepo(async ({ git, commit, runGit }) => {
    commit("old", { [`${SALES}/scale/systel-scale.ts`]: "1" });
    git("tag", "pos-v1.0.0");
    commit("middle", { [`${SALES}/serial-link/open-serial-link.ts`]: "1" });
    git("tag", "pos-v1.1.0");
    git("tag", "cloud-v9.0.0");
    const sha = commit("new", { [`${SALES}/receipt-printer/pc850.ts`]: "1", "README.md": "x" });

    assert.deepEqual(await changedPaths({ sha, runGit }), [
      "README.md",
      `${SALES}/receipt-printer/pc850.ts`,
    ]);
  });
});

test("leaves out the tag being released when it already points at the commit", async () => {
  await withRepo(async ({ git, commit, runGit }) => {
    commit("old", { [`${SALES}/scale/systel-scale.ts`]: "1" });
    git("tag", "pos-v1.0.0");
    const sha = commit("new", { [`${SALES}/receipt-printer/pc850.ts`]: "1" });
    git("tag", "pos-v1.1.0");

    assert.deepEqual(await changedPaths({ sha, excludeTag: "pos-v1.1.0", runGit }), [
      `${SALES}/receipt-printer/pc850.ts`,
    ]);
  });
});

test("covers the whole history when there is no previous release tag", async () => {
  await withRepo(async ({ commit, runGit }) => {
    commit("first", { [`${SALES}/scale/systel-scale.ts`]: "1" });
    const sha = commit("second", { "README.md": "x" });

    assert.deepEqual(await changedPaths({ sha, runGit }), [
      "README.md",
      `${SALES}/scale/systel-scale.ts`,
    ]);
  });
});

test("the CLI outputs the devices a release changes, empty when none", async () => {
  await withRepo(async ({ git, commit, runGit }) => {
    commit("old", { "README.md": "1" });
    git("tag", "pos-v1.0.0");
    const withDevices = commit("new", {
      [`${SALES}/serial-link/open-serial-link.ts`]: "1",
      [`${SALES}/receipt-printer/pc850.ts`]: "1",
    });
    const outputs = [];
    const options = {
      runGit,
      appendOutput: async (_path, text) => outputs.push(text),
      log: () => {},
      logError: () => {},
    };

    assert.equal(
      await runCli({ ...options, env: { TARGET_SHA: withDevices, GITHUB_OUTPUT: "out" } }),
      0,
    );
    git("tag", "pos-v1.1.0");
    const withoutDevices = commit("later", { "README.md": "2" });
    assert.equal(
      await runCli({ ...options, env: { TARGET_SHA: withoutDevices, GITHUB_OUTPUT: "out" } }),
      0,
    );
    assert.deepEqual(outputs, ["devices=printer,scale,barcode reader\n", "devices=\n"]);
  });
});

test("the CLI compares with the previous tag while leaving out RELEASE_TAG", async () => {
  await withRepo(async ({ git, commit, runGit }) => {
    commit("old", { [`${SALES}/scale/systel-scale.ts`]: "1" });
    git("tag", "pos-v1.0.0");
    const sha = commit("new", { "README.md": "x" });
    git("tag", "pos-v1.1.0");
    const outputs = [];

    const status = await runCli({
      env: { TARGET_SHA: sha, RELEASE_TAG: "pos-v1.1.0", GITHUB_OUTPUT: "out" },
      runGit,
      appendOutput: async (_path, text) => outputs.push(text),
      log: () => {},
      logError: () => {},
    });

    assert.equal(status, 0);
    assert.deepEqual(outputs, ["devices=\n"]);
  });
});

test("the CLI names what is missing", async () => {
  const errors = [];

  const status = await runCli({ env: {}, logError: (message) => errors.push(message) });

  assert.equal(status, 1);
  assert.match(errors.join("\n"), /TARGET_SHA/);
});

function gateOptions(sha, runGit, env) {
  const errors = [];
  return {
    errors,
    options: {
      argv: ["gate"],
      env: { TARGET_SHA: sha, GITHUB_OUTPUT: "out", ...env },
      runGit,
      appendOutput: async () => {},
      log: () => {},
      logError: (message) => errors.push(message),
    },
  };
}

test("the gate refuses a release that changes a device when no hardware test is given", async () => {
  await withRepo(async ({ git, commit, runGit }) => {
    commit("old", { "README.md": "1" });
    git("tag", "pos-v1.0.0");
    const sha = commit("new", { [`${SALES}/receipt-printer/pc850.ts`]: "1" });

    for (const hardwareTest of [undefined, "", "  \n"]) {
      const gate = gateOptions(sha, runGit, { HARDWARE_TEST: hardwareTest });

      assert.equal(await runCli(gate.options), 1);
      assert.match(gate.errors.join("\n"), /printer/);
    }
  });
});

test("the gate passes a release that changes a device once a hardware test is given", async () => {
  await withRepo(async ({ git, commit, runGit }) => {
    commit("old", { "README.md": "1" });
    git("tag", "pos-v1.0.0");
    const sha = commit("new", { [`${SALES}/receipt-printer/pc850.ts`]: "1" });
    const gate = gateOptions(sha, runGit, { HARDWARE_TEST: "Ana, 2026-10-14: ok" });

    assert.equal(await runCli(gate.options), 0);
  });
});

test("the gate passes a release that changes no device without a hardware test", async () => {
  await withRepo(async ({ git, commit, runGit }) => {
    commit("old", { "README.md": "1" });
    git("tag", "pos-v1.0.0");
    const sha = commit("new", { "README.md": "2" });
    const gate = gateOptions(sha, runGit, {});

    assert.equal(await runCli(gate.options), 0);
  });
});

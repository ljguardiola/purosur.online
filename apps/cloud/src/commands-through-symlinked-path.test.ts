import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, inject, it } from "vitest";
import { cloudCommands } from "./test-support/cloud-commands.js";

function runNode(args: string[]): Promise<{ status: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env: {}, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stderr }));
  });
}

describe("each cloud command", () => {
  const buildDir = inject("cloudBuildDir");
  const linkParent = mkdtempSync(join(tmpdir(), "purosur-cloud-link-"));
  const linkedBuildRoot = join(linkParent, "linked");
  symlinkSync(dirname(buildDir), linkedBuildRoot, "dir");

  afterAll(() => {
    rmSync(linkParent, { recursive: true, force: true });
  });

  it("is listed", () => {
    expect(cloudCommands()).not.toEqual([]);
  });

  it.each(cloudCommands())("%s loads as a module without running", async (command) => {
    const moduleUrl = pathToFileURL(join(buildDir, `${command}.js`)).href;

    const loaded = await runNode([
      "--input-type=module",
      "-e",
      `await import(${JSON.stringify(moduleUrl)})`,
    ]);

    expect(loaded.status).toBe(0);
  });

  it.each(cloudCommands())(
    "%s runs through a symlinked path as through its own",
    async (command) => {
      const [direct, linked] = await Promise.all([
        runNode([join(buildDir, `${command}.js`)]),
        runNode([join(linkedBuildRoot, basename(buildDir), `${command}.js`)]),
      ]);

      expect(direct.status).toBe(1);
      expect(linked.status).toBe(direct.status);
      expect(linked.stderr).toBe(direct.stderr);
    },
  );
});

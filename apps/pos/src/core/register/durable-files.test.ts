import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeDurability, syncFolderOn } from "./durable-files";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "durable-files-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("nodeDurability", () => {
  it("flushes a file to disk", async () => {
    const path = join(folder, "data");
    await writeFile(path, "content");

    await expect(nodeDurability.file(path)).resolves.toBeUndefined();
  });

  it("fails for a file that does not exist", async () => {
    await expect(nodeDurability.file(join(folder, "missing"))).rejects.toThrow();
  });

  it("flushes a folder to disk", async () => {
    await expect(nodeDurability.folder(folder)).resolves.toBeUndefined();
  });

  it("fails for a folder that does not exist", async () => {
    await expect(nodeDurability.folder(join(folder, "missing"))).rejects.toThrow();
  });
});

describe("syncFolderOn", () => {
  it("leaves Windows folders alone, as it cannot open them to flush", async () => {
    await expect(syncFolderOn("win32", join(folder, "missing"))).resolves.toBeUndefined();
  });

  it("flushes the folder on any other platform", async () => {
    await expect(syncFolderOn("linux", join(folder, "missing"))).rejects.toThrow();
  });
});

import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nodeDurability, syncFolderOn } from "./durable-files";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});

let folder: string;
let handleEvents: string[];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "durable-files-"));
  handleEvents = [];
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(open).mockImplementation(async (path, flags) => {
    const handle = await actual.open(path, flags);
    const sync = handle.sync.bind(handle);
    const close = handle.close.bind(handle);
    handle.sync = async () => {
      handleEvents.push(`sync ${String(path)}`);
      await sync();
    };
    handle.close = async () => {
      handleEvents.push(`close ${String(path)}`);
      await close();
    };
    return handle;
  });
});

afterEach(async () => {
  vi.mocked(open).mockReset();
  await rm(folder, { recursive: true, force: true });
});

describe("nodeDurability", () => {
  it("flushes a file to disk before it closes it", async () => {
    const path = join(folder, "data");
    await writeFile(path, "content");

    await nodeDurability.file(path);

    expect(handleEvents).toEqual([`sync ${path}`, `close ${path}`]);
  });

  it("fails for a file that does not exist", async () => {
    await expect(nodeDurability.file(join(folder, "missing"))).rejects.toThrow();
  });

  it("flushes a folder as the platform it runs on allows", async () => {
    await nodeDurability.folder(folder);

    expect(handleEvents).toEqual(
      process.platform === "win32" ? [] : [`sync ${folder}`, `close ${folder}`],
    );
  });
});

describe("syncFolderOn", () => {
  it("leaves Windows folders alone, as it cannot open them to flush", async () => {
    await syncFolderOn("win32", folder);

    expect(open).not.toHaveBeenCalled();
    expect(handleEvents).toEqual([]);
  });

  it.each(["linux", "darwin"] as const)(
    "flushes the folder to disk before it closes it on %s",
    async (platform) => {
      await syncFolderOn(platform, folder);

      expect(handleEvents).toEqual([`sync ${folder}`, `close ${folder}`]);
    },
  );

  it("fails for a folder that does not exist on a platform that flushes folders", async () => {
    await expect(syncFolderOn("linux", join(folder, "missing"))).rejects.toThrow();
  });
});

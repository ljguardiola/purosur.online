import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SnapshotManifest } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Durability } from "./durable-files";
import {
  lastGenerationSequences,
  pendingManifests,
  readManifests,
  removeLeftovers,
  writeManifest,
} from "./snapshot-generations-folder";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "snapshot-generations-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function manifest(overrides: Partial<SnapshotManifest> = {}): SnapshotManifest {
  return {
    generation_id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    created_at: "2026-10-15T12:00:00.000Z",
    last_device_seq: 41,
    pull_cursor: 977,
    key_version: 2,
    size: 4096,
    sha256: "ab".repeat(32),
    uploaded_at: null,
    refused_at: null,
    ...overrides,
  };
}

const OLDER = manifest({
  generation_id: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-10-15T11:00:00.000Z",
  last_device_seq: 5,
  pull_cursor: 6,
});
const NEWER = manifest({
  generation_id: "00000000-0000-4000-8000-000000000002",
  created_at: "2026-10-15T12:30:00.000Z",
  last_device_seq: 7,
  pull_cursor: 8,
});

describe("writeManifest", () => {
  it("writes the manifest beside the generation, readable back", async () => {
    await writeManifest(folder, manifest());

    expect(await readManifests(folder)).toEqual([manifest()]);
  });

  it("replaces an earlier manifest of the same generation", async () => {
    await writeManifest(folder, manifest());
    await writeManifest(folder, manifest({ uploaded_at: "2026-10-15T12:01:00.000Z" }));

    expect(await readManifests(folder)).toEqual([
      manifest({ uploaded_at: "2026-10-15T12:01:00.000Z" }),
    ]);
  });

  it("leaves nothing but the manifest behind", async () => {
    await writeManifest(folder, manifest());

    expect(await readdir(folder)).toEqual(["0f8fad5b-d9cb-469f-a165-70867728950e.json"]);
  });

  it("flushes the temporary file before it takes the manifest's name, then the folder", async () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const steps: string[] = [];
    const durability: Durability = {
      file: async (path) => {
        steps.push(
          `file ${path.endsWith(".json.tmp") ? "tmp" : "other"} final=${existsSync(join(folder, `${id}.json`))}`,
        );
      },
      folder: async () => {
        steps.push(
          `folder tmp=${existsSync(join(folder, `${id}.json.tmp`))} final=${existsSync(join(folder, `${id}.json`))}`,
        );
      },
    };

    await writeManifest(folder, manifest(), durability);

    expect(steps).toEqual(["file tmp final=false", "folder tmp=false final=true"]);
  });
});

describe("readManifests", () => {
  it("answers nothing for a folder that does not exist", async () => {
    expect(await readManifests(join(folder, "missing"))).toEqual([]);
  });

  it("lists the newest generation first", async () => {
    await writeManifest(folder, OLDER);
    await writeManifest(folder, NEWER);

    expect(await readManifests(folder)).toEqual([NEWER, OLDER]);
  });

  it("orders generations created in the same instant by id, the greater first", async () => {
    const first = manifest({ generation_id: "00000000-0000-4000-8000-00000000000a" });
    const second = manifest({ generation_id: "00000000-0000-4000-8000-00000000000b" });
    await writeManifest(folder, first);
    await writeManifest(folder, second);

    expect(await readManifests(folder)).toEqual([second, first]);
  });

  it("ignores files that are not valid manifests", async () => {
    await writeManifest(folder, NEWER);
    await writeFile(join(folder, "notes.txt"), "hello");
    await writeFile(join(folder, "broken.json"), "{");
    await writeFile(join(folder, "wrong-shape.json"), JSON.stringify({ generation_id: "x" }));
    await writeFile(join(folder, "other.json.tmp"), JSON.stringify(OLDER));
    await mkdir(join(folder, "folder.json"));

    expect(await readManifests(folder)).toEqual([NEWER]);
  });

  it("ignores a manifest filed under another generation's name", async () => {
    await writeFile(join(folder, `${OLDER.generation_id}.json`), JSON.stringify(NEWER));

    expect(await readManifests(folder)).toEqual([]);
  });
});

describe("lastGenerationSequences", () => {
  it("answers the sequences of the newest generation", () => {
    expect(lastGenerationSequences([NEWER, OLDER])).toEqual({ lastDeviceSeq: 7, pullCursor: 8 });
  });

  it("answers nothing when there is no generation", () => {
    expect(lastGenerationSequences([])).toBeUndefined();
  });
});

describe("pendingManifests", () => {
  it("keeps the generations neither uploaded nor refused, in the order given", () => {
    const uploaded = manifest({ uploaded_at: "2026-10-15T12:01:00.000Z" });
    const refused = manifest({ refused_at: "2026-10-15T12:01:00.000Z" });

    expect(pendingManifests([NEWER, uploaded, refused, OLDER])).toEqual([NEWER, OLDER]);
  });
});

describe("removeLeftovers", () => {
  it("removes temporary files of runs that were killed", async () => {
    await writeFile(join(folder, "a.sqlite.tmp"), "x");
    await writeFile(join(folder, "a.snapshot.tmp"), "x");
    await writeFile(join(folder, "a.json.tmp"), "x");

    await removeLeftovers(folder);

    expect(await readdir(folder)).toEqual([]);
  });

  it("removes an encrypted object whose manifest was never written", async () => {
    await writeFile(join(folder, "orphan.snapshot"), "x");

    await removeLeftovers(folder);

    expect(await readdir(folder)).toEqual([]);
  });

  it("keeps a generation with its manifest", async () => {
    await writeManifest(folder, NEWER);
    await writeFile(join(folder, `${NEWER.generation_id}.snapshot`), "x");

    await removeLeftovers(folder);

    expect((await readdir(folder)).sort()).toEqual([
      `${NEWER.generation_id}.json`,
      `${NEWER.generation_id}.snapshot`,
    ]);
  });

  it("does nothing for a folder that does not exist", async () => {
    await expect(removeLeftovers(join(folder, "missing"))).resolves.toBeUndefined();
  });
});

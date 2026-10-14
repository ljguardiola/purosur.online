import { describe, expect, it } from "vitest";
import { restorableSnapshotsSchema } from "./restorable-snapshots.js";

const GENERATION = {
  generation_id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  created_at: "2026-10-14T12:00:00.000Z",
  size: 4096,
  sha256: "ab".repeat(32),
  key_version: 2,
  download_url: "https://bucket.example.test/snapshots/r/g?X-Amz-Signature=abc",
};

describe("restorableSnapshotsSchema", () => {
  it("reads the generations a restore can use", () => {
    expect(restorableSnapshotsSchema.parse({ generations: [GENERATION] })).toEqual({
      generations: [GENERATION],
    });
  });

  it("reads an empty list", () => {
    expect(restorableSnapshotsSchema.parse({ generations: [] })).toEqual({ generations: [] });
  });

  it.each([
    ["a download URL that is not https", { download_url: "http://bucket.example.test/x" }],
    [
      "a download URL whose scheme ends in https",
      { download_url: "xhttps://bucket.example.test/x" },
    ],
    [
      "a download URL whose scheme starts with https",
      { download_url: "httpsx://bucket.example.test/x" },
    ],
    ["a creation time that is not an instant", { created_at: "yesterday" }],
    ["an uppercase hash", { sha256: "AB".repeat(32) }],
    ["a size of zero", { size: 0 }],
    ["a key version of zero", { key_version: 0 }],
    ["a generation id that is not a uuid", { generation_id: "g1" }],
  ])("refuses a generation with %s", (_name, override) => {
    expect(
      restorableSnapshotsSchema.safeParse({ generations: [{ ...GENERATION, ...override }] })
        .success,
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { snapshotManifestSchema } from "./snapshot-manifest.js";

const MANIFEST = {
  generation_id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  created_at: "2026-10-15T12:00:00.000Z",
  last_device_seq: 41,
  pull_cursor: 977,
  key_version: 2,
  size: 4096,
  sha256: "ab".repeat(32),
  uploaded_at: null,
  refused_at: null,
};

describe("snapshotManifestSchema", () => {
  it("reads the manifest of a generation not uploaded yet", () => {
    expect(snapshotManifestSchema.parse(MANIFEST)).toEqual(MANIFEST);
  });

  it("reads the manifest of an uploaded generation", () => {
    const uploaded = { ...MANIFEST, uploaded_at: "2026-10-15T12:00:30.000Z" };

    expect(snapshotManifestSchema.parse(uploaded)).toEqual(uploaded);
  });

  it("reads the manifest of a generation the cloud refused", () => {
    const refused = { ...MANIFEST, refused_at: "2026-10-15T12:00:30.000Z" };

    expect(snapshotManifestSchema.parse(refused)).toEqual(refused);
  });

  it("accepts sequences of zero", () => {
    expect(
      snapshotManifestSchema.safeParse({ ...MANIFEST, last_device_seq: 0, pull_cursor: 0 }).success,
    ).toBe(true);
  });

  it.each([
    ["a generation id that is not a uuid", { generation_id: "../x" }],
    ["a creation time that is not a date", { created_at: "yesterday" }],
    ["a negative local sequence", { last_device_seq: -1 }],
    ["a fractional local sequence", { last_device_seq: 0.5 }],
    ["a negative cloud sequence", { pull_cursor: -1 }],
    ["a fractional cloud sequence", { pull_cursor: 0.5 }],
    ["a key version of zero", { key_version: 0 }],
    ["a size of zero", { size: 0 }],
    ["an uppercase hash", { sha256: "AB".repeat(32) }],
    ["an upload time that is not a date", { uploaded_at: "soon" }],
    ["a refusal time that is not a date", { refused_at: "soon" }],
    ["a field it does not know", { extra: 1 }],
  ])("refuses a manifest with %s", (_name, override) => {
    expect(snapshotManifestSchema.safeParse({ ...MANIFEST, ...override }).success).toBe(false);
  });

  it.each(Object.keys(MANIFEST))("requires %s", (field) => {
    const { [field]: _omitted, ...rest } = MANIFEST as Record<string, unknown>;

    expect(snapshotManifestSchema.safeParse(rest).success).toBe(false);
  });
});

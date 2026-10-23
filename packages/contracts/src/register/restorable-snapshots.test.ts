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

const REGISTER_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const FIRST_INSTALLATION_ID = "3b241101-e2bb-4255-8caf-4136c566a962";

describe("restorableSnapshotsSchema", () => {
  it("reads the generations a restore can use", () => {
    expect(
      restorableSnapshotsSchema.parse({
        register_id: REGISTER_ID,
        first_installation_id: null,
        generations: [GENERATION],
      }),
    ).toEqual({
      register_id: REGISTER_ID,
      first_installation_id: null,
      generations: [GENERATION],
    });
  });

  it("reads a generation id written in uppercase as lowercase", () => {
    const uppercase = { ...GENERATION, generation_id: GENERATION.generation_id.toUpperCase() };
    expect(
      restorableSnapshotsSchema.parse({
        register_id: REGISTER_ID,
        first_installation_id: null,
        generations: [uppercase],
      }),
    ).toEqual({
      register_id: REGISTER_ID,
      first_installation_id: null,
      generations: [GENERATION],
    });
  });

  it("reads an empty list", () => {
    expect(
      restorableSnapshotsSchema.parse({
        register_id: REGISTER_ID,
        first_installation_id: null,
        generations: [],
      }),
    ).toEqual({
      register_id: REGISTER_ID,
      first_installation_id: null,
      generations: [],
    });
  });

  it("reads a register id written in uppercase as lowercase", () => {
    expect(
      restorableSnapshotsSchema.parse({
        register_id: REGISTER_ID.toUpperCase(),
        first_installation_id: null,
        generations: [],
      }),
    ).toEqual({ register_id: REGISTER_ID, first_installation_id: null, generations: [] });
  });

  it("refuses an answer without a register id", () => {
    expect(
      restorableSnapshotsSchema.safeParse({
        first_installation_id: null,
        generations: [GENERATION],
      }).success,
    ).toBe(false);
  });

  it("refuses a register id that is not a uuid", () => {
    expect(
      restorableSnapshotsSchema.safeParse({
        register_id: "r1",
        first_installation_id: null,
        generations: [],
      }).success,
    ).toBe(false);
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
      restorableSnapshotsSchema.safeParse({
        register_id: REGISTER_ID,
        first_installation_id: null,
        generations: [{ ...GENERATION, ...override }],
      }).success,
    ).toBe(false);
  });

  it("reads the first installation of the register", () => {
    expect(
      restorableSnapshotsSchema.parse({
        register_id: REGISTER_ID,
        first_installation_id: FIRST_INSTALLATION_ID.toUpperCase(),
        generations: [],
      }).first_installation_id,
    ).toBe(FIRST_INSTALLATION_ID);
  });

  it("refuses an answer that does not say whether the register had a first installation", () => {
    expect(
      restorableSnapshotsSchema.safeParse({ register_id: REGISTER_ID, generations: [] }).success,
    ).toBe(false);
  });

  it("refuses a first installation id that is not a uuid", () => {
    expect(
      restorableSnapshotsSchema.safeParse({
        register_id: REGISTER_ID,
        first_installation_id: "i1",
        generations: [],
      }).success,
    ).toBe(false);
  });
});

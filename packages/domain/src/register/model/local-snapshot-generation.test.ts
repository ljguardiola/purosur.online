import { describe, expect, it } from "vitest";
import {
  isPendingSnapshotGeneration,
  isSettlingSnapshotRefusal,
  type LocalSnapshotGeneration,
  lastSnapshotGenerationSequences,
  pendingSnapshotGenerationsNewestFirst,
} from "./local-snapshot-generation.js";

function generation(overrides: Partial<LocalSnapshotGeneration> = {}): LocalSnapshotGeneration {
  return {
    generationId: "00000000-0000-4000-8000-000000000005",
    createdAt: new Date("2026-10-15T12:00:00.000Z"),
    sequences: { lastDeviceSeq: 1, pullCursor: 2 },
    keyVersion: 1,
    size: 10,
    sha256: "ab".repeat(32),
    uploadedAt: null,
    refusedAt: null,
    ...overrides,
  };
}

const OLDER = generation({
  generationId: "00000000-0000-4000-8000-000000000009",
  createdAt: new Date("2026-10-15T11:00:00.000Z"),
  sequences: { lastDeviceSeq: 3, pullCursor: 4 },
});
const NEWER = generation({
  generationId: "00000000-0000-4000-8000-000000000001",
  createdAt: new Date("2026-10-15T12:30:00.000Z"),
  sequences: { lastDeviceSeq: 7, pullCursor: 8 },
});
const SETTLED_AT = new Date("2026-10-15T12:45:00.000Z");

describe("isPendingSnapshotGeneration", () => {
  it("is pending while it was neither uploaded nor refused", () => {
    expect(isPendingSnapshotGeneration(generation())).toBe(true);
  });

  it("is not pending once uploaded", () => {
    expect(isPendingSnapshotGeneration(generation({ uploadedAt: SETTLED_AT }))).toBe(false);
  });

  it("is not pending once refused", () => {
    expect(isPendingSnapshotGeneration(generation({ refusedAt: SETTLED_AT }))).toBe(false);
  });
});

describe("pendingSnapshotGenerationsNewestFirst", () => {
  it("keeps only the pending generations, the newest first", () => {
    const uploaded = generation({ uploadedAt: SETTLED_AT });
    const refused = generation({ refusedAt: SETTLED_AT });

    expect(pendingSnapshotGenerationsNewestFirst([OLDER, uploaded, NEWER, refused])).toEqual([
      NEWER,
      OLDER,
    ]);
    expect(pendingSnapshotGenerationsNewestFirst([NEWER, OLDER])).toEqual([NEWER, OLDER]);
  });

  it("orders generations created in the same instant by id, the greater first", () => {
    const first = generation({ generationId: "00000000-0000-4000-8000-00000000000a" });
    const second = generation({ generationId: "00000000-0000-4000-8000-00000000000b" });

    expect(pendingSnapshotGenerationsNewestFirst([first, second])).toEqual([second, first]);
    expect(pendingSnapshotGenerationsNewestFirst([second, first])).toEqual([second, first]);
  });

  it("leaves the generations it was given in their order", () => {
    const given = [OLDER, NEWER];

    pendingSnapshotGenerationsNewestFirst(given);

    expect(given).toEqual([OLDER, NEWER]);
  });
});

describe("lastSnapshotGenerationSequences", () => {
  it("answers the sequences of the newest generation", () => {
    expect(lastSnapshotGenerationSequences([OLDER, NEWER])).toEqual({
      lastDeviceSeq: 7,
      pullCursor: 8,
    });
    expect(lastSnapshotGenerationSequences([NEWER, OLDER])).toEqual({
      lastDeviceSeq: 7,
      pullCursor: 8,
    });
  });

  it("counts an uploaded or refused generation as the last one, so an idle register does not retake it", () => {
    expect(lastSnapshotGenerationSequences([OLDER, { ...NEWER, refusedAt: SETTLED_AT }])).toEqual({
      lastDeviceSeq: 7,
      pullCursor: 8,
    });
    expect(lastSnapshotGenerationSequences([OLDER, { ...NEWER, uploadedAt: SETTLED_AT }])).toEqual({
      lastDeviceSeq: 7,
      pullCursor: 8,
    });
  });

  it("answers nothing while there is no generation", () => {
    expect(lastSnapshotGenerationSequences([])).toBeUndefined();
  });

  it("leaves the generations it was given in their order", () => {
    const given = [OLDER, NEWER];

    lastSnapshotGenerationSequences(given);

    expect(given).toEqual([OLDER, NEWER]);
  });
});

describe("isSettlingSnapshotRefusal", () => {
  it.each(["conflict", "validation_failed"])(
    "settles a generation the cloud refused as %s, as it never takes it",
    (code) => {
      expect(isSettlingSnapshotRefusal(code)).toBe(true);
    },
  );

  it.each(["snapshot_backups_unavailable", "rate_limited", "internal_error"])(
    "leaves a generation pending when the cloud answered %s",
    (code) => {
      expect(isSettlingSnapshotRefusal(code)).toBe(false);
    },
  );
});

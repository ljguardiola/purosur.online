import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_VERIFICATION_QUERY_LIMIT,
  snapshotVerificationAnswerSchema,
  snapshotVerificationQuerySchema,
} from "./snapshot-verification.js";

const FIRST = "00000000-0000-4000-8000-000000000001";
const SECOND = "00000000-0000-4000-8000-000000000002";

function idNumber(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

describe("snapshotVerificationQuerySchema", () => {
  it("reads one asked generation as a list of one", () => {
    expect(snapshotVerificationQuerySchema.parse({ generation_id: FIRST })).toEqual({
      generation_id: [FIRST],
    });
  });

  it("reads several asked generations, in lowercase", () => {
    expect(
      snapshotVerificationQuerySchema.parse({ generation_id: [FIRST, SECOND.toUpperCase()] }),
    ).toEqual({ generation_id: [FIRST, SECOND] });
  });

  it("refuses a query that asks about no generation", () => {
    expect(snapshotVerificationQuerySchema.safeParse({}).success).toBe(false);
    expect(snapshotVerificationQuerySchema.safeParse({ generation_id: [] }).success).toBe(false);
  });

  it("refuses an asked generation that is not a record id", () => {
    expect(
      snapshotVerificationQuerySchema.safeParse({ generation_id: [FIRST, "latest"] }).success,
    ).toBe(false);
  });

  it("asks about at most the limit of generations at once", () => {
    const ids = Array.from({ length: SNAPSHOT_VERIFICATION_QUERY_LIMIT + 1 }, (_, index) =>
      idNumber(index),
    );

    expect(
      snapshotVerificationQuerySchema.safeParse({ generation_id: ids.slice(0, -1) }).success,
    ).toBe(true);
    expect(snapshotVerificationQuerySchema.safeParse({ generation_id: ids }).success).toBe(false);
  });
});

describe("snapshotVerificationAnswerSchema", () => {
  it("reads the verified generations", () => {
    expect(
      snapshotVerificationAnswerSchema.parse({ verified_generation_ids: [FIRST.toUpperCase()] }),
    ).toEqual({ verified_generation_ids: [FIRST] });
  });

  it("reads an answer with no verified generation", () => {
    expect(snapshotVerificationAnswerSchema.parse({ verified_generation_ids: [] })).toEqual({
      verified_generation_ids: [],
    });
  });

  it("refuses an answer that names something other than a generation", () => {
    expect(
      snapshotVerificationAnswerSchema.safeParse({ verified_generation_ids: ["latest"] }).success,
    ).toBe(false);
    expect(snapshotVerificationAnswerSchema.safeParse({}).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { restoredRegisterOrphanSweepResponseSchema } from "./restored-register-orphan-sweep.js";

const swept = { state: "SWEPT", credit_noted_numbers: [41], alerted_numbers: [42, 43] };

describe("restoredRegisterOrphanSweepResponseSchema", () => {
  it("reads a sweep with the numbers it credit noted and the numbers it alerted", () => {
    expect(restoredRegisterOrphanSweepResponseSchema.parse(swept)).toEqual(swept);
  });

  it("reads a sweep that found nothing", () => {
    const nothing = { state: "SWEPT", credit_noted_numbers: [], alerted_numbers: [] };

    expect(restoredRegisterOrphanSweepResponseSchema.parse(nothing)).toEqual(nothing);
  });

  it("reads the answer that the numbering is not reconciled yet", () => {
    expect(
      restoredRegisterOrphanSweepResponseSchema.parse({ state: "NUMBERING_NOT_RECONCILED" }),
    ).toEqual({ state: "NUMBERING_NOT_RECONCILED" });
  });

  it.each(["credit_noted_numbers", "alerted_numbers"])(
    "refuses a sweep without its %s",
    (field) => {
      expect(
        restoredRegisterOrphanSweepResponseSchema.safeParse({ ...swept, [field]: undefined })
          .success,
      ).toBe(false);
    },
  );

  it.each([0, -1, 1.5])("refuses the number %s", (number) => {
    expect(
      restoredRegisterOrphanSweepResponseSchema.safeParse({ ...swept, alerted_numbers: [number] })
        .success,
    ).toBe(false);
    expect(
      restoredRegisterOrphanSweepResponseSchema.safeParse({
        ...swept,
        credit_noted_numbers: [number],
      }).success,
    ).toBe(false);
  });

  it("refuses an unknown state", () => {
    expect(restoredRegisterOrphanSweepResponseSchema.safeParse({ state: "OTHER" }).success).toBe(
      false,
    );
  });
});

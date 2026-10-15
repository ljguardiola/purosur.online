import type { FortnightReportState } from "@purosur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type FortnightPresentationBody,
  fortnightPresentationListSchema,
} from "./fortnight-presentation.js";

const presentation = {
  register_id: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
  point_of_sale_number: 4,
  fortnight_start: "2026-09-01",
  fortnight_end: "2026-09-15",
  deadline: "2026-09-23",
  state: "blocked",
};

describe("fortnightPresentationListSchema", () => {
  it("reads the presentations of a branch, with or without a recorded state", () => {
    const list = [presentation, { ...presentation, state: null }];

    expect(fortnightPresentationListSchema.parse(list)).toEqual(list);
    expect(fortnightPresentationListSchema.parse([])).toEqual([]);
  });

  it.each(["blocked", "submitting", "refused", "accepted", "needs_regularization"] as const)(
    "reads the %s state",
    (state) => {
      expect(fortnightPresentationListSchema.parse([{ ...presentation, state }])).toEqual([
        { ...presentation, state },
      ]);
    },
  );

  it.each(["paused", "ready"])("refuses the state %s, which the domain does not know", (state) => {
    expect(fortnightPresentationListSchema.safeParse([{ ...presentation, state }]).success).toBe(
      false,
    );
  });

  it.each([
    "register_id",
    "point_of_sale_number",
    "fortnight_start",
    "fortnight_end",
    "deadline",
    "state",
  ])("refuses a presentation without its %s", (field) => {
    expect(
      fortnightPresentationListSchema.safeParse([{ ...presentation, [field]: undefined }]).success,
    ).toBe(false);
  });

  it("refuses a number the tax authority does not allow", () => {
    expect(
      fortnightPresentationListSchema.safeParse([{ ...presentation, point_of_sale_number: 0 }])
        .success,
    ).toBe(false);
  });

  it("carries exactly the states the domain defines", () => {
    expectTypeOf<FortnightPresentationBody["state"]>().toEqualTypeOf<FortnightReportState | null>();
  });
});

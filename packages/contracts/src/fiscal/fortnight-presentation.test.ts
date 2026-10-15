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
  document_type: "factura_c",
  document_count: 36,
  rejected_document: null,
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
    "document_type",
    "document_count",
    "rejected_document",
  ])("refuses a presentation without its %s", (field) => {
    expect(
      fortnightPresentationListSchema.safeParse([{ ...presentation, [field]: undefined }]).success,
    ).toBe(false);
  });

  it("reads a presentation without a document type", () => {
    const list = [{ ...presentation, document_type: null, document_count: 0 }];

    expect(fortnightPresentationListSchema.parse(list)).toEqual(list);
  });

  it("reads the document the tax authority rejected and how many were left unprocessed", () => {
    const list = [
      { ...presentation, rejected_document: { number: 17, unprocessed: 0 } },
      { ...presentation, rejected_document: { number: 3, unprocessed: 12 } },
    ];

    expect(fortnightPresentationListSchema.parse(list)).toEqual(list);
  });

  it.each([
    { document_type: "factura_a" },
    { document_count: -1 },
    { document_count: 1.5 },
    { rejected_document: { number: 0, unprocessed: 0 } },
    { rejected_document: { number: 17, unprocessed: -1 } },
    { rejected_document: { number: 17 } },
  ])("refuses the presentation fields %j", (fields) => {
    expect(
      fortnightPresentationListSchema.safeParse([{ ...presentation, ...fields }]).success,
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

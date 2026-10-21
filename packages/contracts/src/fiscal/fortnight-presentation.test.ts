import type {
  FortnightPresentationRefusal,
  FortnightPresentationState,
  FortnightReportMovement,
  RejectedDocumentRemedyState,
} from "@purosur/domain";
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
  movement: "documents",
  refusal: null,
  state: "blocked",
};

describe("fortnightPresentationListSchema", () => {
  it("reads the presentations of a branch, with or without a recorded state", () => {
    const list = [presentation, { ...presentation, state: null }];

    expect(fortnightPresentationListSchema.parse(list)).toEqual(list);
    expect(fortnightPresentationListSchema.parse([])).toEqual([]);
  });

  it.each([
    "blocked",
    "missing_document",
    "submitting",
    "refused",
    "accepted",
    "needs_regularization",
    "listed_as_owed",
  ] as const)("reads the %s state", (state) => {
    expect(fortnightPresentationListSchema.parse([{ ...presentation, state }])).toEqual([
      { ...presentation, state },
    ]);
  });

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
    "movement",
    "refusal",
  ])("refuses a presentation without its %s", (field) => {
    expect(
      fortnightPresentationListSchema.safeParse([{ ...presentation, [field]: undefined }]).success,
    ).toBe(false);
  });

  it("reads a presentation without a document type", () => {
    const list = [{ ...presentation, document_type: null, document_count: 0 }];

    expect(fortnightPresentationListSchema.parse(list)).toEqual(list);
  });

  const rejectedDocument = {
    number: 17,
    unprocessed: 0,
    document_id: "7c1f4d52-0f7e-4a53-9f4c-2a7d2f1c9b11",
    issued_on: "2026-09-03",
    total: 125000,
    buyer_document_type: 99,
    buyer_document_number: 0,
    buyer_tax_status_code: 5,
    rejections: [{ code: 10016, message: "Fecha de comprobante fuera de rango" }],
    remedy: "awaiting_remedy",
  };

  it("reads the document the tax authority rejected as presented, with its rejections and how many were left unprocessed", () => {
    const list = [
      { ...presentation, rejected_document: rejectedDocument },
      {
        ...presentation,
        rejected_document: {
          ...rejectedDocument,
          number: 3,
          unprocessed: 12,
          rejections: [],
          remedy: "awaiting_resend",
        },
      },
    ];

    expect(fortnightPresentationListSchema.parse(list)).toEqual(list);
  });

  it("reads what the presentation declared and whether it was refused in part or whole", () => {
    const list = [
      { ...presentation, document_type: null, document_count: 0, movement: "none" },
      { ...presentation, movement: null },
      { ...presentation, state: "refused", refusal: "partial" },
      { ...presentation, state: "refused", refusal: "whole" },
    ];

    expect(fortnightPresentationListSchema.parse(list)).toEqual(list);
  });

  it.each([
    { document_type: "factura_a" },
    { movement: "some" },
    { refusal: "half" },
    { document_count: -1 },
    { document_count: 1.5 },
    { rejected_document: { ...rejectedDocument, number: 0 } },
    { rejected_document: { ...rejectedDocument, unprocessed: -1 } },
    { rejected_document: { number: 17, unprocessed: 0 } },
    { rejected_document: { ...rejectedDocument, remedy: "remedied" } },
    { rejected_document: { ...rejectedDocument, rejections: [{ code: "x", message: "m" }] } },
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

  it("carries exactly the states, movements and refusals the domain defines", () => {
    expectTypeOf<
      FortnightPresentationBody["state"]
    >().toEqualTypeOf<FortnightPresentationState | null>();
    expectTypeOf<
      FortnightPresentationBody["movement"]
    >().toEqualTypeOf<FortnightReportMovement | null>();
    expectTypeOf<
      NonNullable<FortnightPresentationBody["rejected_document"]>["remedy"]
    >().toEqualTypeOf<RejectedDocumentRemedyState>();
    expectTypeOf<
      FortnightPresentationBody["refusal"]
    >().toEqualTypeOf<FortnightPresentationRefusal | null>();
  });
});

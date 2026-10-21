import { describe, expect, it } from "vitest";
import {
  rejectedDocumentRemedyBodySchema,
  rejectedDocumentRemedyResponseSchema,
} from "./rejected-document-remedy.js";

const base = {
  point_of_sale_number: 4,
  fortnight_start: "2026-09-01",
  document_type: "factura_c",
  number: 17,
};

describe("rejectedDocumentRemedyBodySchema", () => {
  it("reads the remedy that reports the document again as it was printed", () => {
    const body = { ...base, remedy: { kind: "report" } };

    expect(rejectedDocumentRemedyBodySchema.parse(body)).toEqual(body);
  });

  it("reads the remedy that corrects what was printed, with any of the corrected fields", () => {
    const bodies = [
      { ...base, remedy: { kind: "printed", correction: { issued_on: "2026-09-03" } } },
      {
        ...base,
        remedy: {
          kind: "printed",
          correction: {
            issued_on: "2026-09-03",
            total: 125000,
            buyer_document_type: 80,
            buyer_document_number: 20000000001,
            buyer_tax_status_code: 1,
          },
        },
      },
      { ...base, remedy: { kind: "printed", correction: {} } },
    ];

    for (const body of bodies) {
      expect(rejectedDocumentRemedyBodySchema.parse(body)).toEqual(body);
    }
  });

  it.each(["point_of_sale_number", "fortnight_start", "document_type", "number", "remedy"])(
    "refuses a body without its %s",
    (field) => {
      expect(
        rejectedDocumentRemedyBodySchema.safeParse({
          ...base,
          remedy: { kind: "report" },
          [field]: undefined,
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    { remedy: { kind: "discard" } },
    { remedy: { kind: "printed" } },
    { remedy: { kind: "printed", correction: { total: 12.5 } } },
    { remedy: { kind: "printed", correction: { issued_on: 20260903 } } },
    { remedy: { kind: "printed", correction: { buyer_tax_status_code: "1" } } },
    { document_type: "factura_a" },
    { number: 0 },
    { number: 1.5 },
    { point_of_sale_number: 0 },
  ])("refuses the body fields %j", (fields) => {
    expect(
      rejectedDocumentRemedyBodySchema.safeParse({ ...base, remedy: { kind: "report" }, ...fields })
        .success,
    ).toBe(false);
  });
});

describe("rejectedDocumentRemedyResponseSchema", () => {
  it("reads when the remedy was recorded and the fields it changed with their values before and after", () => {
    const response = {
      recorded_at: "2026-09-20T15:00:00.000Z",
      changes: [
        { field: "issued_on", before: "2026-09-02", after: "2026-09-03" },
        { field: "total", before: 1000, after: 1250 },
      ],
    };

    expect(rejectedDocumentRemedyResponseSchema.parse(response)).toEqual(response);
    expect(rejectedDocumentRemedyResponseSchema.parse({ ...response, changes: [] })).toEqual({
      ...response,
      changes: [],
    });
  });

  it("refuses a change of a field that cannot be corrected", () => {
    expect(
      rejectedDocumentRemedyResponseSchema.safeParse({
        recorded_at: "2026-09-20T15:00:00.000Z",
        changes: [{ field: "number", before: 1, after: 2 }],
      }).success,
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { lastDocumentOf } from "./clock-guard-text";

describe("lastDocumentOf", () => {
  it("is nothing when no block is given", () => {
    expect(lastDocumentOf([])).toBeUndefined();
  });

  it("shows the latest reading among the blocks", () => {
    const last = lastDocumentOf([
      {
        point_of_sale: 2,
        document_type: "factura_c",
        latest_reading: "2026-09-15T10:00:00.000-03:00",
        tax_authority_last_authorized_issued_on: null,
      },
      {
        point_of_sale: 3,
        document_type: "factura_c",
        latest_reading: "2026-09-16T11:31:00.000-03:00",
        tax_authority_last_authorized_issued_on: null,
      },
    ]);

    expect(last).toEqual({ text: "16/09/2026 · 11:31" });
  });

  it("shows the latest reading on the clock it is written in, whatever the day in UTC", () => {
    const last = lastDocumentOf([
      {
        point_of_sale: 3,
        document_type: "factura_c",
        latest_reading: "2026-09-16T22:31:00.000-03:00",
        tax_authority_last_authorized_issued_on: null,
      },
    ]);

    expect(last?.text).toBe("16/09/2026 · 22:31");
  });

  it("shows the day the tax authority last authorized when no block has a reading", () => {
    const last = lastDocumentOf([
      {
        point_of_sale: 3,
        document_type: "factura_c",
        latest_reading: null,
        tax_authority_last_authorized_issued_on: "2026-09-16",
      },
    ]);

    expect(last).toEqual({ text: "16/09/2026" });
  });

  it("prefers a block with a reading over one that only has the tax authority's day", () => {
    const last = lastDocumentOf([
      {
        point_of_sale: 2,
        document_type: "factura_c",
        latest_reading: null,
        tax_authority_last_authorized_issued_on: "2026-09-20",
      },
      {
        point_of_sale: 3,
        document_type: "factura_c",
        latest_reading: "2026-09-16T11:31:00.000-03:00",
        tax_authority_last_authorized_issued_on: null,
      },
    ]);

    expect(last).toEqual({ text: "16/09/2026 · 11:31" });
  });
});

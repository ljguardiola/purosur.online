import { describe, expect, it } from "vitest";
import { clockReadingText, lastDocumentOf, modalEyebrow } from "./clock-guard-text";

describe("clockReadingText", () => {
  it("shows the day and the time of an instant", () => {
    expect(clockReadingText("2026-09-16T11:31:00.000Z")).toBe("16/09/2026 · 11:31");
  });
});

describe("lastDocumentOf", () => {
  it("is nothing when no block is given", () => {
    expect(lastDocumentOf([])).toBeUndefined();
  });

  it("names the block with the latest reading and its point of sale", () => {
    const last = lastDocumentOf([
      {
        point_of_sale: 2,
        document_type: "factura_c",
        latest_reading: "2026-09-15T10:00:00.000Z",
        tax_authority_last_authorized_issued_on: null,
      },
      {
        point_of_sale: 3,
        document_type: "factura_c",
        latest_reading: "2026-09-16T11:31:00.000Z",
        tax_authority_last_authorized_issued_on: null,
      },
    ]);

    expect(last).toEqual({ pointOfSale: 3, text: "16/09/2026 · 11:31" });
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

    expect(last).toEqual({ pointOfSale: 3, text: "16/09/2026" });
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
        latest_reading: "2026-09-16T11:31:00.000Z",
        tax_authority_last_authorized_issued_on: null,
      },
    ]);

    expect(last).toEqual({ pointOfSale: 3, text: "16/09/2026 · 11:31" });
  });

  it("keeps the first block when two share the latest reading", () => {
    const reading = "2026-09-16T11:31:00.000Z";
    const last = lastDocumentOf([
      {
        point_of_sale: 4,
        document_type: "factura_c",
        latest_reading: reading,
        tax_authority_last_authorized_issued_on: null,
      },
      {
        point_of_sale: 3,
        document_type: "factura_c",
        latest_reading: reading,
        tax_authority_last_authorized_issued_on: null,
      },
    ]);

    expect(last?.pointOfSale).toBe(4);
  });
});

describe("modalEyebrow", () => {
  it("names the register and the point of sale", () => {
    expect(modalEyebrow("Caja 1", 3)).toBe("Caja 1 · Punto de venta 00003");
  });

  it("names only the point of sale when the register has no name yet", () => {
    expect(modalEyebrow(null, 3)).toBe("Punto de venta 00003");
  });
});

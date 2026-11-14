import { describe, expect, it } from "vitest";
import {
  resolutionForReason,
  returnLineFormValuesOf,
  returnLineRequestFrom,
  returnLineRequestSchema,
} from "./return-line-form";
import { HONEY, NIBS, PASTA, SALE } from "./test-support/sale-for-return";

describe("the line being edited", () => {
  it("starts from the line as drafted", () => {
    expect(
      returnLineFormValuesOf(SALE, {
        quantity: "2",
        reason: "defective",
        disposition: "discard",
        resolution: "exchange",
      }),
    ).toEqual({
      quantity: "2",
      reason: "defective",
      disposition: "discard",
      resolution: "exchange",
    });
  });

  it("starts from a change of mind, refunded and back on sale, when the draft chose nothing", () => {
    expect(
      returnLineFormValuesOf(SALE, {
        quantity: "3",
        reason: null,
        disposition: null,
        resolution: null,
      }),
    ).toEqual({
      quantity: "3",
      reason: "change_of_mind",
      disposition: "restock",
      resolution: "refund",
    });
  });
});

describe("the resolution of a line when its reason changes", () => {
  it("is kept while the sale still offers it for the new reason", () => {
    expect(resolutionForReason(SALE, "defective", "refund")).toBe("refund");
  });

  it("becomes the first the sale offers for the new reason when it no longer offers it", () => {
    expect(resolutionForReason(SALE, "change_of_mind", "exchange")).toBe("refund");
  });

  it("becomes the first the sale offers when none was chosen", () => {
    expect(resolutionForReason(SALE, "defective", null)).toBe("refund");
  });

  it("is none when the sale offers none for the reason", () => {
    const offersNothing = {
      ...SALE,
      offered_resolutions: { ...SALE.offered_resolutions, defective: [] },
    };

    expect(resolutionForReason(offersNothing, "defective", "refund")).toBeNull();
  });
});

describe("the request of the line being edited", () => {
  it("reads the typed quantity in the line's unit", () => {
    const values = {
      quantity: "0,200",
      reason: "defective",
      disposition: "discard",
      resolution: "exchange",
    } as const;

    const request = returnLineRequestFrom(NIBS, values);

    expect(request).toEqual({
      sale_line_id: NIBS.id,
      quantity: 200,
      reason: "defective",
      disposition: "discard",
      resolution: "exchange",
    });
    expect(returnLineRequestSchema.safeParse(request).success).toBe(true);
  });

  it("asks for all that remains of a line that goes back whole for the reason", () => {
    const values = {
      quantity: "1",
      reason: "change_of_mind",
      disposition: "restock",
      resolution: "refund",
    } as const;

    expect(returnLineRequestFrom(HONEY, values).quantity).toBe(2);
  });

  it("asks for a quantity of nothing when what is typed is not a quantity", () => {
    const values = {
      quantity: "dos",
      reason: "change_of_mind",
      disposition: "restock",
      resolution: "refund",
    } as const;

    expect(returnLineRequestFrom(PASTA, values).quantity).toBe(0);
  });
});

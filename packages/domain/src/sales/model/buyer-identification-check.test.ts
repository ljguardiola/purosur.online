import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buyerIdentificationRefusal } from "./buyer-identification-check.js";

const threshold = { id: "t1", amount: 5000, validFrom: "2026-01-01" };
const moment = new Date("2026-07-01T15:00:00.000Z");
const approved = { state: "APPROVED" };
const notApprovedStates = ["REJECTED", "DECLINED", "PENDING"];

describe("buyerIdentificationRefusal", () => {
  it("refuses a sale with no payment whose total reaches the threshold in effect, naming it", () => {
    expect(buyerIdentificationRefusal(5000, [], [threshold], moment)).toEqual({
      kind: "reaches_buyer_identification_threshold",
      threshold: 5000,
    });
  });

  it("refuses a sale with no payment when no threshold is in effect", () => {
    expect(buyerIdentificationRefusal(1, [], [], moment)).toEqual({
      kind: "no_buyer_identification_threshold",
    });
  });

  it("lets a sale with no payment below the threshold in effect be charged", () => {
    expect(buyerIdentificationRefusal(4999, [], [threshold], moment)).toBeUndefined();
  });

  it("refuses nothing once the sale has an approved payment, even when its total reaches the threshold", () => {
    expect(buyerIdentificationRefusal(5000, [approved], [threshold], moment)).toBeUndefined();
  });

  it("refuses nothing once the sale has an approved payment, even when no threshold is in effect", () => {
    expect(buyerIdentificationRefusal(5000, [approved], [], moment)).toBeUndefined();
  });

  it.each(notApprovedStates)(
    "still applies the threshold when the sale's only payment is %s",
    (state) => {
      expect(buyerIdentificationRefusal(5000, [{ state }], [threshold], moment)).toEqual({
        kind: "reaches_buyer_identification_threshold",
        threshold: 5000,
      });
      expect(buyerIdentificationRefusal(5000, [{ state }], [], moment)).toEqual({
        kind: "no_buyer_identification_threshold",
      });
    },
  );

  it("applies the threshold to every total while no payment is approved", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.array(fc.constantFrom(...notApprovedStates).map((state) => ({ state }))),
        (total, payments) => {
          expect(buyerIdentificationRefusal(total, payments, [threshold], moment)).toEqual(
            total >= threshold.amount
              ? { kind: "reaches_buyer_identification_threshold", threshold: threshold.amount }
              : undefined,
          );
          expect(buyerIdentificationRefusal(total, payments, [], moment)).toEqual({
            kind: "no_buyer_identification_threshold",
          });
        },
      ),
    );
  });

  it("refuses nothing for any total once any of the sale's payments is approved", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.array(fc.constantFrom(...notApprovedStates).map((state) => ({ state }))),
        fc.array(fc.constantFrom(...notApprovedStates).map((state) => ({ state }))),
        fc.boolean(),
        (total, before, after, withThreshold) => {
          const payments = [...before, approved, ...after];
          const thresholds = withThreshold ? [threshold] : [];
          expect(buyerIdentificationRefusal(total, payments, thresholds, moment)).toBeUndefined();
        },
      ),
    );
  });
});

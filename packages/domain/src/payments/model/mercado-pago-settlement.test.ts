import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  chargeCostOf,
  isChargeMovement,
  type SettlementMovement,
} from "./mercado-pago-settlement.js";

const SALE: SettlementMovement = {
  sourceId: "1000000001",
  transactionType: "SETTLEMENT",
  transactionDate: new Date("2026-10-01T13:00:00Z"),
  grossAmount: 10_000,
  feeAmount: -340,
  financingFeeAmount: 0,
  taxesAmount: -120,
  netAmount: 9540,
  moneyReleaseDate: new Date("2026-10-01T13:00:00Z"),
};

const REFUND: SettlementMovement = {
  sourceId: "1000000001",
  transactionType: "REFUND",
  transactionDate: new Date("2026-10-03T15:00:00Z"),
  grossAmount: -4000,
  feeAmount: 136,
  financingFeeAmount: 0,
  taxesAmount: 30,
  netAmount: -3834,
  moneyReleaseDate: new Date("2026-10-03T15:00:00Z"),
};

describe("isChargeMovement", () => {
  it.each(["SETTLEMENT", "REFUND", "CHARGEBACK", "DISPUTE"])(
    "counts %s as part of a charge",
    (type) => {
      expect(isChargeMovement(type)).toBe(true);
    },
  );

  it.each(["WITHDRAWAL", "WITHDRAWAL_CANCEL", "PAYOUT"])(
    "leaves %s out, since it moves money out of the account instead of charging",
    (type) => {
      expect(isChargeMovement(type)).toBe(false);
    },
  );
});

describe("chargeCostOf", () => {
  it("shows the figures of a charge that has only its own movement", () => {
    expect(chargeCostOf([SALE])).toEqual({
      grossAmount: 10_000,
      feeAmount: -340,
      financingFeeAmount: 0,
      taxesAmount: -120,
      netAmount: 9540,
      moneyReleaseDate: new Date("2026-10-01T13:00:00Z"),
    });
  });

  it("adds a later refund to the charge, which shows the total of both", () => {
    expect(chargeCostOf([SALE, REFUND])).toEqual({
      grossAmount: 6000,
      feeAmount: -204,
      financingFeeAmount: 0,
      taxesAmount: -90,
      netAmount: 5706,
      moneyReleaseDate: new Date("2026-10-01T13:00:00Z"),
    });
  });

  it("releases the money on the latest release date of the charge's own movements", () => {
    const secondInstallment: SettlementMovement = {
      ...SALE,
      moneyReleaseDate: new Date("2026-11-01T13:00:00Z"),
    };
    expect(chargeCostOf([SALE, secondInstallment]).moneyReleaseDate).toEqual(
      new Date("2026-11-01T13:00:00Z"),
    );
  });

  it("keeps the release date of the charge, not of a later refund", () => {
    expect(chargeCostOf([REFUND, SALE]).moneyReleaseDate).toEqual(new Date("2026-10-01T13:00:00Z"));
  });

  it("has no release date while no movement of the charge has one", () => {
    expect(chargeCostOf([{ ...SALE, moneyReleaseDate: null }]).moneyReleaseDate).toBeNull();
  });

  it("adds up every figure of the movements whatever their order", () => {
    const movement = fc.record({
      sourceId: fc.constant("1000000001"),
      transactionType: fc.constantFrom("SETTLEMENT", "REFUND", "CHARGEBACK", "DISPUTE"),
      transactionDate: fc.constant(new Date("2026-10-01T13:00:00Z")),
      grossAmount: fc.integer({ min: -100_000, max: 100_000 }),
      feeAmount: fc.integer({ min: -10_000, max: 10_000 }),
      financingFeeAmount: fc.integer({ min: -10_000, max: 10_000 }),
      taxesAmount: fc.integer({ min: -10_000, max: 10_000 }),
      netAmount: fc.integer({ min: -100_000, max: 100_000 }),
      moneyReleaseDate: fc.constant(null),
    });
    fc.assert(
      fc.property(fc.array(movement, { minLength: 1, maxLength: 6 }), (movements) => {
        const cost = chargeCostOf(movements);
        const reversed = chargeCostOf([...movements].reverse());
        expect(reversed).toEqual(cost);
        expect(cost.netAmount).toBe(movements.reduce((sum, m) => sum + m.netAmount, 0));
        expect(cost.taxesAmount).toBe(movements.reduce((sum, m) => sum + m.taxesAmount, 0));
      }),
    );
  });
});

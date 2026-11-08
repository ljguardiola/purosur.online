import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FIXED_ARGENTINA_ZONE_RULES } from "../../shared/index.js";
import {
  type ChargeCostEntry,
  type OtherChargeInput,
  type OwnChargeInput,
  summarizeChargeCosts,
} from "./mercado-pago-charge-costs.js";
import type { SettlementMovement } from "./mercado-pago-settlement.js";

const RULES = FIXED_ARGENTINA_ZONE_RULES;
const PERIOD = { from: "2026-09-01", to: "2026-10-31" };

function movement(overrides: Partial<SettlementMovement> = {}): SettlementMovement {
  return {
    sourceId: "1000000001",
    transactionType: "SETTLEMENT",
    transactionDate: new Date("2026-10-01T13:00:00Z"),
    grossAmount: 10_000,
    feeAmount: -340,
    financingFeeAmount: -100,
    taxesAmount: -120,
    netAmount: 9440,
    moneyReleaseDate: new Date("2026-10-15T13:00:00Z"),
    ...overrides,
  };
}

function charge(overrides: Partial<OwnChargeInput> = {}): OwnChargeInput {
  return {
    paymentTransactionId: "tx-1",
    saleId: "sale-1",
    method: "QR",
    registerId: "register-1",
    registerName: "Caja 1",
    amount: 10_000,
    chargedAt: new Date("2026-10-01T13:00:00Z"),
    movements: [movement()],
    ...overrides,
  };
}

function other(overrides: Partial<OtherChargeInput> = {}): OtherChargeInput {
  return {
    sourceId: "2000000001",
    movements: [movement({ sourceId: "2000000001" })],
    ...overrides,
  };
}

function summarize(charges: OwnChargeInput[], others: OtherChargeInput[] = []) {
  return summarizeChargeCosts({ charges, otherCharges: others, period: PERIOD, rules: RULES });
}

const NO_FIGURES = {
  chargesCount: 0,
  pendingCount: 0,
  grossAmount: 0,
  feeAmount: 0,
  financingFeeAmount: 0,
  taxesAmount: 0,
  netAmount: 0,
};

describe("summarizeChargeCosts", () => {
  it("shows the cost of a charge from its movements", () => {
    const { charges } = summarize([charge()]);

    expect(charges).toEqual([
      {
        paymentTransactionId: "tx-1",
        saleId: "sale-1",
        method: "QR",
        registerId: "register-1",
        registerName: "Caja 1",
        amount: 10_000,
        chargedAt: new Date("2026-10-01T13:00:00Z"),
        cost: {
          grossAmount: 10_000,
          feeAmount: -340,
          financingFeeAmount: -100,
          taxesAmount: -120,
          netAmount: 9440,
          moneyReleaseDate: new Date("2026-10-15T13:00:00Z"),
        },
      },
    ]);
  });

  it("adds a later refund to the same charge", () => {
    const refund = movement({
      transactionType: "REFUND",
      grossAmount: -4000,
      feeAmount: 136,
      financingFeeAmount: 0,
      taxesAmount: 30,
      netAmount: -3834,
    });

    const { charges, totals } = summarize([charge({ movements: [movement(), refund] })]);

    expect(charges[0]?.cost?.grossAmount).toBe(6000);
    expect(totals.grossAmount).toBe(6000);
    expect(totals.netAmount).toBe(5606);
  });

  it("shows a charge no report carried yet as pending and adds no figure for it", () => {
    const { charges, totals } = summarize([charge({ movements: [] })]);

    expect(charges[0]?.cost).toBeNull();
    expect(totals).toEqual({ ...NO_FIGURES, chargesCount: 1, pendingCount: 1 });
  });

  it("lists the charges newest first", () => {
    const { charges } = summarize([
      charge({ paymentTransactionId: "old", chargedAt: new Date("2026-10-01T13:00:00Z") }),
      charge({ paymentTransactionId: "new", chargedAt: new Date("2026-10-03T13:00:00Z") }),
      charge({ paymentTransactionId: "middle", chargedAt: new Date("2026-10-02T13:00:00Z") }),
    ]);

    expect(charges.map((entry) => entry.paymentTransactionId)).toEqual(["new", "middle", "old"]);
  });

  it("lists no charge for the charges outside the system", () => {
    expect(summarize([], [other()]).charges).toEqual([]);
  });

  it("counts a charge made late in the Argentine evening on that day, not on the UTC day", () => {
    const { days } = summarize([charge({ chargedAt: new Date("2026-10-02T01:30:00Z") })]);

    expect(days.map((day) => day.day)).toEqual(["2026-10-01"]);
  });

  it("groups by day ascending", () => {
    const { days } = summarize([
      charge({ paymentTransactionId: "b", chargedAt: new Date("2026-10-05T15:00:00Z") }),
      charge({ paymentTransactionId: "a", chargedAt: new Date("2026-10-02T15:00:00Z") }),
      charge({ paymentTransactionId: "c", chargedAt: new Date("2026-10-05T16:00:00Z") }),
    ]);

    expect(days.map((day) => [day.day, day.chargesCount])).toEqual([
      ["2026-10-02", 1],
      ["2026-10-05", 2],
    ]);
  });

  it("groups by month ascending", () => {
    const { months } = summarize([
      charge({ paymentTransactionId: "oct", chargedAt: new Date("2026-10-05T15:00:00Z") }),
      charge({ paymentTransactionId: "sep", chargedAt: new Date("2026-09-30T15:00:00Z") }),
      charge({ paymentTransactionId: "oct2", chargedAt: new Date("2026-10-06T15:00:00Z") }),
    ]);

    expect(months.map((month) => [month.month, month.chargesCount])).toEqual([
      ["2026-09", 1],
      ["2026-10", 2],
    ]);
  });

  it("groups by payment method in the order QR, Point, other, leaving out the methods without charges", () => {
    const { methods } = summarize(
      [
        charge({ paymentTransactionId: "p", method: "POINT" }),
        charge({ paymentTransactionId: "q", method: "QR" }),
      ],
      [other()],
    );

    expect(methods.map((entry) => [entry.method, entry.chargesCount])).toEqual([
      ["QR", 1],
      ["POINT", 1],
      ["OTHER", 1],
    ]);
    expect(summarize([charge({ method: "POINT" })]).methods.map((entry) => entry.method)).toEqual([
      "POINT",
    ]);
  });

  it("groups by register by name with the charges outside the system last", () => {
    const { registers } = summarize(
      [
        charge({ paymentTransactionId: "b", registerId: "r-b", registerName: "Terminal B" }),
        charge({ paymentTransactionId: "a", registerId: "r-a", registerName: "Caja A" }),
        charge({ paymentTransactionId: "a2", registerId: "r-a", registerName: "Caja A" }),
      ],
      [other()],
    );

    expect(
      registers.map((entry) => [entry.registerId, entry.registerName, entry.chargesCount]),
    ).toEqual([
      ["r-a", "Caja A", 2],
      ["r-b", "Terminal B", 1],
      [null, null, 1],
    ]);
  });

  it("groups the Point and QR charges of one register together", () => {
    const { registers } = summarize([
      charge({ paymentTransactionId: "q", method: "QR" }),
      charge({ paymentTransactionId: "p", method: "POINT" }),
    ]);

    expect(registers).toHaveLength(1);
    expect(registers[0]?.chargesCount).toBe(2);
  });

  it("counts a charge outside the system under other charges with its figures and no sale", () => {
    const { totals, methods, registers, days } = summarize([], [other()]);

    expect(totals).toEqual({
      ...NO_FIGURES,
      chargesCount: 1,
      grossAmount: 10_000,
      feeAmount: -340,
      financingFeeAmount: -100,
      taxesAmount: -120,
      netAmount: 9440,
    });
    expect(methods).toEqual([{ method: "OTHER", ...totals }]);
    expect(registers).toEqual([{ registerId: null, registerName: null, ...totals }]);
    expect(days).toEqual([{ day: "2026-10-01", ...totals }]);
  });

  it("adds every movement of a charge outside the system to the same charge", () => {
    const { totals } = summarize(
      [],
      [
        other({
          movements: [
            movement({ sourceId: "2000000001" }),
            movement({ sourceId: "2000000001", transactionType: "REFUND", grossAmount: -1000 }),
          ],
        }),
      ],
    );

    expect(totals.chargesCount).toBe(1);
    expect(totals.grossAmount).toBe(9000);
  });

  it("dates a charge outside the system by its earliest movement", () => {
    const { days } = summarize(
      [],
      [
        other({
          movements: [
            movement({ transactionDate: new Date("2026-10-09T15:00:00Z") }),
            movement({ transactionDate: new Date("2026-10-04T15:00:00Z") }),
          ],
        }),
      ],
    );

    expect(days.map((day) => day.day)).toEqual(["2026-10-04"]);
  });

  it("leaves out a charge outside the system whose day falls outside the period", () => {
    const { totals } = summarize(
      [],
      [
        other({ movements: [movement({ transactionDate: new Date("2026-11-02T15:00:00Z") })] }),
        other({
          sourceId: "before",
          movements: [movement({ transactionDate: new Date("2026-08-31T15:00:00Z") })],
        }),
      ],
    );

    expect(totals).toEqual(NO_FIGURES);
  });

  it("keeps a charge outside the system on the first and last day of the period", () => {
    const { totals } = summarize(
      [],
      [
        other({ movements: [movement({ transactionDate: new Date("2026-09-01T03:00:00Z") })] }),
        other({
          sourceId: "last",
          movements: [movement({ transactionDate: new Date("2026-10-31T23:00:00Z") })],
        }),
      ],
    );

    expect(totals.chargesCount).toBe(2);
  });

  it("reports empty groups and zero totals without charges", () => {
    expect(summarize([])).toEqual({
      charges: [],
      days: [],
      months: [],
      methods: [],
      registers: [],
      totals: NO_FIGURES,
    });
  });

  it("adds figures only for reported costs while pending charges still count", () => {
    const { days, months, methods, registers, totals } = summarize([
      charge({ paymentTransactionId: "reported" }),
      charge({ paymentTransactionId: "pending", movements: [] }),
    ]);

    const expected = {
      chargesCount: 2,
      pendingCount: 1,
      grossAmount: 10_000,
      feeAmount: -340,
      financingFeeAmount: -100,
      taxesAmount: -120,
      netAmount: 9440,
    };
    expect(totals).toEqual(expected);
    expect(days[0]).toMatchObject(expected);
    expect(months[0]).toMatchObject(expected);
    expect(methods[0]).toMatchObject(expected);
    expect(registers[0]).toMatchObject(expected);
  });

  it("adds up every figure in each grouping whatever the charges", () => {
    const figure = fc.integer({ min: -50_000, max: 50_000 });
    const entry = fc.record({
      method: fc.constantFrom("QR" as const, "POINT" as const),
      registerIndex: fc.integer({ min: 0, max: 2 }),
      day: fc.integer({ min: 1, max: 28 }),
      gross: figure,
      fee: figure,
      financing: figure,
      taxes: figure,
      net: figure,
      reported: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 12 }), (entries) => {
        const charges = entries.map((generated, index) =>
          charge({
            paymentTransactionId: `tx-${index}`,
            method: generated.method,
            registerId: `r-${generated.registerIndex}`,
            registerName: `Caja ${generated.registerIndex}`,
            chargedAt: new Date(Date.UTC(2026, 9, generated.day, 15)),
            movements: generated.reported
              ? [
                  movement({
                    grossAmount: generated.gross,
                    feeAmount: generated.fee,
                    financingFeeAmount: generated.financing,
                    taxesAmount: generated.taxes,
                    netAmount: generated.net,
                  }),
                ]
              : [],
          }),
        );
        const summary = summarize(charges);
        const reported = entries.filter((generated) => generated.reported);
        const sumOf = (pick: (generated: (typeof entries)[number]) => number) =>
          reported.reduce((sum, generated) => sum + pick(generated), 0);

        expect(summary.totals.chargesCount).toBe(entries.length);
        expect(summary.totals.pendingCount).toBe(entries.length - reported.length);
        expect(summary.totals.grossAmount).toBe(sumOf((generated) => generated.gross));
        expect(summary.totals.netAmount).toBe(sumOf((generated) => generated.net));
        for (const grouping of [
          summary.days,
          summary.months,
          summary.methods,
          summary.registers,
        ] as ChargeCostEntry[][]) {
          expect(grouping.reduce((sum, group) => sum + group.chargesCount, 0)).toBe(entries.length);
          expect(grouping.reduce((sum, group) => sum + group.pendingCount, 0)).toBe(
            summary.totals.pendingCount,
          );
          expect(grouping.reduce((sum, group) => sum + group.grossAmount, 0)).toBe(
            summary.totals.grossAmount,
          );
          expect(grouping.reduce((sum, group) => sum + group.feeAmount, 0)).toBe(
            summary.totals.feeAmount,
          );
          expect(grouping.reduce((sum, group) => sum + group.financingFeeAmount, 0)).toBe(
            summary.totals.financingFeeAmount,
          );
          expect(grouping.reduce((sum, group) => sum + group.taxesAmount, 0)).toBe(
            summary.totals.taxesAmount,
          );
          expect(grouping.reduce((sum, group) => sum + group.netAmount, 0)).toBe(
            summary.totals.netAmount,
          );
        }
      }),
    );
  });
});

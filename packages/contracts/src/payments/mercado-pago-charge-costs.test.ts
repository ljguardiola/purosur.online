import { describe, expect, it } from "vitest";
import {
  mercadoPagoChargeCostsQuerySchema,
  mercadoPagoChargeCostsSchema,
} from "./mercado-pago-charge-costs.js";

const entry = {
  charges_count: 2,
  pending_count: 1,
  gross_amount: 10_000,
  fee_amount: -340,
  financing_fee_amount: 0,
  taxes_amount: -120,
  net_amount: 9540,
};

const reported = {
  payment_transaction_id: "0b0a5a42-1f9a-4a53-9f55-3e1c1c0d7a10",
  sale_id: "7d1f0e2a-3b4c-4d5e-8f60-718293a4b5c6",
  method: "POINT",
  register_id: "5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9",
  register_name: "Caja 1",
  amount: 10_000,
  charged_at: "2026-10-01T13:00:00.000Z",
  cost: {
    gross_amount: 10_000,
    fee_amount: -340,
    financing_fee_amount: 0,
    taxes_amount: -120,
    net_amount: 9540,
    money_release_date: "2026-10-01T13:00:00.000Z",
  },
};

const report = {
  range: { from: "2026-10-01", to: "2026-10-31" },
  charges: [reported, { ...reported, method: "QR", cost: null }],
  days: [{ day: "2026-10-01", ...entry }],
  months: [{ month: "2026-10", ...entry }],
  methods: [
    { method: "QR", ...entry },
    { method: "POINT", ...entry },
    { method: "OTHER", ...entry },
  ],
  registers: [
    { register_id: reported.register_id, register_name: "Caja 1", ...entry },
    { register_id: null, register_name: null, ...entry },
  ],
  totals: entry,
};

describe("mercadoPagoChargeCostsQuerySchema", () => {
  it("accepts a period or no period at all", () => {
    expect(mercadoPagoChargeCostsQuerySchema.parse({})).toEqual({});
    expect(
      mercadoPagoChargeCostsQuerySchema.parse({ from: "2026-10-01", to: "2026-10-31" }),
    ).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("refuses a period with only one end", () => {
    expect(mercadoPagoChargeCostsQuerySchema.safeParse({ from: "2026-10-01" }).success).toBe(false);
  });
});

describe("mercadoPagoChargeCostsSchema", () => {
  it("accepts the costs of each charge, a pending one included, with the period's totals", () => {
    expect(mercadoPagoChargeCostsSchema.parse(report)).toEqual(report);
  });

  it("accepts a charge whose money has no release date yet", () => {
    const body = {
      ...report,
      charges: [{ ...reported, cost: { ...reported.cost, money_release_date: null } }],
    };

    expect(mercadoPagoChargeCostsSchema.safeParse(body).success).toBe(true);
  });

  it.each([
    [
      "a charge of a method that is not Mercado Pago's",
      { charges: [{ ...reported, method: "CASH" }] },
    ],
    ["a method group that does not exist", { methods: [{ method: "CASH", ...entry }] }],
    ["a negative count", { totals: { ...entry, charges_count: -1 } }],
    ["an amount with decimals", { totals: { ...entry, fee_amount: -3.4 } }],
    ["a month that is not a calendar month", { months: [{ month: "2026-13", ...entry }] }],
    ["a day that is not a calendar day", { days: [{ day: "2026-02-30", ...entry }] }],
    ["a charge without a time", { charges: [{ ...reported, charged_at: "2026-10-01" }] }],
  ])("refuses %s", (_, change) => {
    expect(mercadoPagoChargeCostsSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  handConfirmedPaymentsQuerySchema,
  handConfirmedPaymentsSchema,
} from "./hand-confirmed-payments.js";

const REGISTER_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";
const CASHIER_ID = "9a3e7c40-2b1d-4f6a-8c05-5d7e1a3b9c28";

describe("handConfirmedPaymentsQuerySchema", () => {
  it("accepts a query asking for nothing", () => {
    expect(handConfirmedPaymentsQuerySchema.parse({})).toEqual({});
  });

  it("accepts a range of calendar days, a register and a method", () => {
    const query = {
      from: "2026-10-01",
      to: "2026-10-06",
      register_id: REGISTER_ID,
      method: "STANDALONE_TERMINAL",
    };

    expect(handConfirmedPaymentsQuerySchema.parse(query)).toEqual(query);
  });

  it.each(["TRANSFER", "STANDALONE_TERMINAL"])("accepts the method %s", (method) => {
    expect(handConfirmedPaymentsQuerySchema.parse({ method })).toEqual({ method });
  });

  it("reads a register id written in capitals as the lowercase id records are kept under", () => {
    expect(
      handConfirmedPaymentsQuerySchema.parse({ register_id: REGISTER_ID.toUpperCase() }),
    ).toEqual({ register_id: REGISTER_ID });
  });

  it.each([
    ["a range ending before it starts", { from: "2026-10-06", to: "2026-10-05" }],
    ["a start without an end", { from: "2026-10-06" }],
    ["an end without a start", { to: "2026-10-06" }],
    ["a bound that is not a calendar day", { from: "2026-02-30", to: "2026-03-01" }],
    ["a register that is not an id", { register_id: "caja-1" }],
    ["a method that is not confirmed by hand", { method: "CASH" }],
    ["a method that does not exist", { method: "CHEQUE" }],
  ])("refuses %s", (_name, query) => {
    expect(handConfirmedPaymentsQuerySchema.safeParse(query).success).toBe(false);
  });
});

const methods = [
  { method: "TRANSFER", count: 2, amount: 1_500 },
  { method: "STANDALONE_TERMINAL", count: 1, amount: 400 },
];

const report = {
  range: { from: "2026-10-05", to: "2026-10-06" },
  totals: { count: 3, amount: 1_900 },
  methods,
  cashiers: [{ cashier_id: CASHIER_ID, cashier_name: "Ana", count: 3, amount: 1_900, methods }],
  payments: [
    {
      id: "6f1c2b7e-0a4d-4c55-8d21-3b9e5a7c1d02",
      method: "TRANSFER",
      amount: 1_000,
      confirmed_at: "2026-10-06T14:00:00.000Z",
      cashier_name: "Ana",
      confirmed_by_name: "Beto",
      sale_operation_number: 7,
    },
  ],
};

describe("handConfirmedPaymentsSchema", () => {
  it("accepts the reconciliation of a range with its payments", () => {
    expect(handConfirmedPaymentsSchema.parse(report)).toEqual(report);
  });

  it("accepts a range without payments", () => {
    const empty = {
      ...report,
      totals: { count: 0, amount: 0 },
      methods: methods.map(({ method }) => ({ method, count: 0, amount: 0 })),
      cashiers: [],
      payments: [],
    };

    expect(handConfirmedPaymentsSchema.parse(empty)).toEqual(empty);
  });

  it("accepts a payment whose people or sale are unknown", () => {
    const unknown = {
      ...report,
      cashiers: [{ cashier_id: CASHIER_ID, cashier_name: null, count: 3, amount: 1_900, methods }],
      payments: [
        {
          ...report.payments[0],
          cashier_name: null,
          confirmed_by_name: null,
          sale_operation_number: null,
        },
      ],
    };

    expect(handConfirmedPaymentsSchema.parse(unknown)).toEqual(unknown);
  });

  it.each([
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
    ["a negative count", { totals: { count: -1, amount: 1 } }],
    ["a total with decimals", { totals: { count: 1, amount: 1.5 } }],
    ["a negative amount", { totals: { count: 1, amount: -1 } }],
    [
      "a method that is not confirmed by hand",
      { methods: [{ method: "CASH", count: 1, amount: 1 }] },
    ],
    ["a method total without count", { methods: [{ method: "TRANSFER", amount: 1 }] }],
    ["a cashier without an id", { cashiers: [{ cashier_name: "Ana", count: 1, amount: 1, methods }] }],
    [
      "a cashier with an empty id",
      { cashiers: [{ cashier_id: "", cashier_name: "Ana", count: 1, amount: 1, methods }] },
    ],
    ["a cashier without a name field", { cashiers: [{ cashier_id: CASHIER_ID, count: 1, amount: 1, methods }] }],
    [
      "a cashier count with decimals",
      { cashiers: [{ cashier_id: CASHIER_ID, cashier_name: "Ana", count: 1.5, amount: 1, methods }] },
    ],
    [
      "a cashier amount that is negative",
      { cashiers: [{ cashier_id: CASHIER_ID, cashier_name: "Ana", count: 1, amount: -1, methods }] },
    ],
    [
      "a payment confirmed at something that is not an instant",
      { payments: [{ ...report.payments[0], confirmed_at: "ayer" }] },
    ],
    [
      "a payment of a method that is not confirmed by hand",
      { payments: [{ ...report.payments[0], method: "QR" }] },
    ],
    ["a payment with a negative amount", { payments: [{ ...report.payments[0], amount: -1 }] }],
    ["a payment with decimals", { payments: [{ ...report.payments[0], amount: 1.5 }] }],
    [
      "an operation number of zero",
      { payments: [{ ...report.payments[0], sale_operation_number: 0 }] },
    ],
    [
      "an operation number with decimals",
      { payments: [{ ...report.payments[0], sale_operation_number: 1.5 }] },
    ],
    [
      "a payment without the confirming person's name field",
      {
        payments: [
          {
            id: report.payments[0]?.id,
            method: "TRANSFER",
            amount: 1,
            confirmed_at: "2026-10-06T14:00:00.000Z",
            cashier_name: "Ana",
            sale_operation_number: 7,
          },
        ],
      },
    ],
  ])("refuses %s", (_name, change) => {
    expect(handConfirmedPaymentsSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});

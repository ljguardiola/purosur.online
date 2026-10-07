import { preEmissionGateFailedEvent } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { syncedEventPayloadSchema } from "./synced-event-payloads.js";
import { recordedEvents } from "./test-support/recorded-pushes.js";

type Payload = Record<string, unknown>;

function recordedPayload(eventType: string, schemaVersion: number, index = 0): Payload {
  const matching = recordedEvents().filter(
    (event) => event.event_type === eventType && event.schema_version === schemaVersion,
  );
  return structuredClone(matching[index]?.payload as Payload);
}

function accepts(eventType: string, schemaVersion: number, payload: unknown): boolean {
  return syncedEventPayloadSchema(eventType, schemaVersion)?.safeParse(payload).success === true;
}

const CASH_PAYMENT_V2 = {
  id: "pay-1",
  kind: "SALE",
  method: "CASH",
  provider: "NONE",
  amount: 2700,
  tendered: 5000,
  state: "APPROVED",
  occurred_at: "2026-10-06T11:20:00.000Z",
  authorized_by: null,
  confirmed_at: null,
};

const TRANSFER_PAYMENT_V2 = {
  ...CASH_PAYMENT_V2,
  id: "pay-2",
  method: "TRANSFER",
  tendered: null,
  authorized_by: "user-2",
  confirmed_at: "2026-10-06T11:21:00.000Z",
};

const PAYMENT_V1 = {
  id: "pay-1",
  kind: "SALE",
  method: "CASH",
  provider: "NONE",
  amount: 2700,
  tendered: 5000,
  state: "APPROVED",
  occurred_at: "2026-09-14T11:20:00.000Z",
};

describe("synced event payloads", () => {
  it("describes every event the registers pushed in the recorded pushes", () => {
    const refused = recordedEvents().filter(
      (event) =>
        !accepts(event.event_type, event.schema_version, event.payload) ||
        syncedEventPayloadSchema(event.event_type, event.schema_version) === undefined,
    );

    expect(refused).toEqual([]);
  });

  it("covers every event type and version the recorded pushes hold", () => {
    const pairs = new Set(recordedEvents().map((e) => `@`));

    expect([...pairs].sort()).toEqual([
      "cash_movement_recorded@1",
      "cash_session_closed@1",
      "cash_session_opened@1",
      "fiscal_gate_failed@1",
      "sale_completed@1",
      "sale_completed@2",
    ]);
  });

  it("describes the gate failure the domain builds", () => {
    const { payload } = preEmissionGateFailedEvent({
      eventId: "event-1",
      saleId: "sale-1",
      registerId: "register-1",
      actorId: "user-1",
      reason: "buyer_tax_status_missing",
      evaluatedAt: new Date("2026-10-06T11:20:00.000Z"),
    });

    expect(accepts("fiscal_gate_failed", 1, payload)).toBe(true);
  });

  it.each([
    ["an unknown event type", "sale_opened", 1],
    ["a sale_completed version nobody emitted", "sale_completed", 3],
    ["version zero", "sale_completed", 0],
    ["a cash_session_opened version nobody emitted", "cash_session_opened", 2],
    ["a cash_session_closed version nobody emitted", "cash_session_closed", 2],
    ["a cash_movement_recorded version nobody emitted", "cash_movement_recorded", 2],
    ["a fiscal_gate_failed version nobody emitted", "fiscal_gate_failed", 2],
    ["a prototype property name", "constructor", 1],
    ["a prototype property name as the version", "sale_completed", Number.NaN],
  ])("has no schema for %s", (_case, eventType, schemaVersion) => {
    expect(syncedEventPayloadSchema(eventType, schemaVersion)).toBeUndefined();
  });

  it.each([
    ["cash_session_opened", 1],
    ["cash_session_closed", 1],
    ["cash_movement_recorded", 1],
    ["fiscal_gate_failed", 1],
    ["sale_completed", 1],
    ["sale_completed", 2],
  ])("refuses %s v%i without any one of its fields", (eventType, schemaVersion) => {
    const payload = recordedPayload(eventType, schemaVersion);

    const accepted = Object.keys(payload).filter((key) => {
      const { [key]: _removed, ...rest } = payload;
      return accepts(eventType, schemaVersion, rest);
    });

    expect(accepted).toEqual([]);
  });

  it.each([
    ["cash_session_opened", 1],
    ["cash_session_closed", 1],
    ["cash_movement_recorded", 1],
    ["fiscal_gate_failed", 1],
    ["sale_completed", 1],
    ["sale_completed", 2],
  ])("refuses %s v%i with any one of its fields of the wrong type", (eventType, schemaVersion) => {
    const payload = recordedPayload(eventType, schemaVersion);

    const accepted = Object.keys(payload).filter((key) =>
      accepts(eventType, schemaVersion, { ...payload, [key]: { unexpected: true } }),
    );

    expect(accepted).toEqual([]);
  });

  it.each([
    ["cash_session_opened", 1],
    ["cash_session_closed", 1],
    ["cash_movement_recorded", 1],
    ["fiscal_gate_failed", 1],
    ["sale_completed", 1],
    ["sale_completed", 2],
  ])("refuses a %s v%i that is not an object", (eventType, schemaVersion) => {
    expect(accepts(eventType, schemaVersion, null)).toBe(false);
    expect(accepts(eventType, schemaVersion, [])).toBe(false);
  });

  describe("cash_session_opened v1", () => {
    const opened = () => recordedPayload("cash_session_opened", 1);

    it.each([
      ["a fractional opening float", { opening_float: 100.5 }],
      ["a negative opening float", { opening_float: -1 }],
      ["an opening float over the cash limit", { opening_float: 2_147_483_648 }],
      ["a date that is not ISO", { opened_at: "yesterday" }],
    ])("refuses %s", (_case, change) => {
      expect(accepts("cash_session_opened", 1, { ...opened(), ...change })).toBe(false);
    });

    it("accepts a session opened with nothing in the drawer", () => {
      expect(accepts("cash_session_opened", 1, { ...opened(), opening_float: 0 })).toBe(true);
    });

    it("accepts the highest amount of cash", () => {
      expect(accepts("cash_session_opened", 1, { ...opened(), opening_float: 2_147_483_647 })).toBe(
        true,
      );
    });
  });

  describe("cash_session_closed v1", () => {
    const closed = () => recordedPayload("cash_session_closed", 1);

    it.each([
      ["a fractional counted cash", { counted_cash: 1.5 }],
      ["a negative counted cash", { counted_cash: -1 }],
      ["a negative expected cash", { expected_cash: -1 }],
      ["a fractional difference", { difference: 0.5 }],
      ["a date that is not ISO", { closed_at: "later" }],
    ])("refuses %s", (_case, change) => {
      expect(accepts("cash_session_closed", 1, { ...closed(), ...change })).toBe(false);
    });

    it("accepts a negative difference", () => {
      expect(accepts("cash_session_closed", 1, { ...closed(), difference: -300 })).toBe(true);
    });
  });

  describe("cash_movement_recorded v1", () => {
    const movement = () => recordedPayload("cash_movement_recorded", 1);

    it.each(["CASH_IN", "CASH_OUT", "WITHDRAWAL"])("accepts a %s", (type) => {
      expect(accepts("cash_movement_recorded", 1, { ...movement(), type })).toBe(true);
    });

    it.each(["SALE", "OPENING", "cash_in", ""])("refuses the type %j", (type) => {
      expect(accepts("cash_movement_recorded", 1, { ...movement(), type })).toBe(false);
    });

    it.each([
      ["a zero amount", { amount: 0 }],
      ["a negative amount", { amount: -5 }],
      ["a fractional amount", { amount: 1.5 }],
      ["an amount over the cash limit", { amount: 2_147_483_648 }],
      ["an empty reason", { reason: "" }],
    ])("refuses %s", (_case, change) => {
      expect(accepts("cash_movement_recorded", 1, { ...movement(), ...change })).toBe(false);
    });

    it("accepts a movement with a reference and an authorizer", () => {
      expect(
        accepts("cash_movement_recorded", 1, {
          ...movement(),
          ref_type: "sale",
          ref_id: "sale-1",
          authorized_by: "user-2",
        }),
      ).toBe(true);
    });

    it("refuses a reference type without its id as a number", () => {
      expect(accepts("cash_movement_recorded", 1, { ...movement(), ref_id: 7 })).toBe(false);
    });

    it("refuses an authorizer that is not text or null", () => {
      expect(accepts("cash_movement_recorded", 1, { ...movement(), authorized_by: 7 })).toBe(false);
    });
  });

  describe("fiscal_gate_failed v1", () => {
    const failed = () => recordedPayload("fiscal_gate_failed", 1);

    it.each([
      "issuer_identification_missing",
      "legal_name_missing",
      "gross_income_registration_missing",
      "activity_start_date_missing",
      "buyer_tax_status_missing",
    ])("accepts the reason %s", (reason) => {
      expect(accepts("fiscal_gate_failed", 1, { ...failed(), reason })).toBe(true);
    });

    it("refuses a reason the gate does not have", () => {
      expect(accepts("fiscal_gate_failed", 1, { ...failed(), reason: "other" })).toBe(false);
    });

    it("refuses a date that is not ISO", () => {
      expect(accepts("fiscal_gate_failed", 1, { ...failed(), evaluated_at: "now" })).toBe(false);
    });
  });

  describe.each([
    [1, "completed_at"],
    [2, "occurred_at"],
  ])("sale_completed v%i", (version, _dateField) => {
    const sale = () => recordedPayload("sale_completed", version);
    const salePayment = (): Payload => (sale().payments as Payload[])[0] as Payload;
    const withPayments = (payments: unknown[]) => ({ ...sale(), payments });
    const firstSale = () => recordedPayload("sale_completed", version, 0);

    it.each([
      ["a fractional total", { total: 10.5 }],
      ["a negative total", { total: -1 }],
      ["a date that is not ISO", { occurred_at: "today" }],
      ["lines that are not a list", { lines: {} }],
    ])("refuses %s", (_case, change) => {
      expect(accepts("sale_completed", version, { ...sale(), ...change })).toBe(false);
    });

    it("accepts a sale without cash movements", () => {
      expect(accepts("sale_completed", version, { ...sale(), cash_movements: [] })).toBe(true);
    });

    it("refuses a sale without payments", () => {
      expect(accepts("sale_completed", version, withPayments([]))).toBe(false);
    });

    it("accepts a sale with several payments", () => {
      const payment = salePayment();
      expect(accepts("sale_completed", version, withPayments([payment, payment]))).toBe(true);
    });

    it("refuses a payment missing any one of its fields", () => {
      const payment = salePayment();

      const optionalSinceV2 = version === 1 ? ["authorized_by", "confirmed_at"] : [];

      const accepted = Object.keys(payment)
        .filter((key) => !optionalSinceV2.includes(key))
        .filter((key) => {
          const { [key]: _removed, ...rest } = payment;
          return accepts("sale_completed", version, withPayments([rest]));
        });

      expect(accepted).toEqual([]);
    });

    it.each(["CARD", "cash", ""])("refuses the payment method %j", (method) => {
      expect(accepts("sale_completed", version, withPayments([{ ...salePayment(), method }]))).toBe(
        false,
      );
    });

    it.each([
      ["a fractional amount", { amount: 0.5 }],
      ["a negative amount", { amount: -1 }],
      ["a fractional tendered amount", { tendered: 1.5 }],
      ["a date that is not ISO", { occurred_at: "now" }],
    ])("refuses a payment with %s", (_case, change) => {
      expect(
        accepts("sale_completed", version, withPayments([{ ...salePayment(), ...change }])),
      ).toBe(false);
    });

    it("accepts a cash payment without a tendered amount", () => {
      expect(
        accepts("sale_completed", version, withPayments([{ ...salePayment(), tendered: null }])),
      ).toBe(true);
    });

    it("refuses a line missing any one of its fields", () => {
      const line = (sale().lines as Payload[])[0] as Payload;

      const accepted = Object.keys(line).filter((key) => {
        const { [key]: _removed, ...rest } = line;
        return accepts("sale_completed", version, { ...sale(), lines: [rest] });
      });

      expect(accepted).toEqual([]);
    });

    it("refuses a line with a fractional quantity", () => {
      const line = (sale().lines as Payload[])[0] as Payload;

      expect(
        accepts("sale_completed", version, { ...sale(), lines: [{ ...line, quantity: 1.5 }] }),
      ).toBe(false);
    });

    it("refuses a line with a zero quantity", () => {
      const line = (sale().lines as Payload[])[0] as Payload;

      expect(
        accepts("sale_completed", version, { ...sale(), lines: [{ ...line, quantity: 0 }] }),
      ).toBe(false);
    });

    it.each([
      ["a negative price", { list_unit_price: -1 }],
      ["a negative discount", { discount_amount: -1 }],
      ["a fractional line total", { line_total: 1.5 }],
    ])("refuses a line with %s", (_case, change) => {
      const line = (sale().lines as Payload[])[0] as Payload;

      expect(
        accepts("sale_completed", version, { ...sale(), lines: [{ ...line, ...change }] }),
      ).toBe(false);
    });

    it("accepts a line without promotions or a promotion id", () => {
      const line = (sale().lines as Payload[])[0] as Payload;

      expect(
        accepts("sale_completed", version, {
          ...sale(),
          lines: [{ ...line, promotion_id: null, promotions: [] }],
        }),
      ).toBe(true);
    });

    it.each([
      ["a percent promotion", { kind: "PERCENT_OFF", percent: 10, buy_qty: null, pay_qty: null }],
      ["a buy n pay m promotion", { kind: "BUY_N_PAY_M", percent: null, buy_qty: 3, pay_qty: 2 }],
    ])("accepts a line with %s", (_case, benefit) => {
      const line = (sale().lines as Payload[])[0] as Payload;
      const promotion = { discount_id: "discount-1", ...benefit };

      expect(
        accepts("sale_completed", version, {
          ...sale(),
          lines: [{ ...line, promotions: [promotion] }],
        }),
      ).toBe(true);
    });

    it.each([
      ["an unknown kind", { kind: "TWO_FOR_ONE", percent: null, buy_qty: null, pay_qty: null }],
      ["a percent promotion without a percent", { kind: "PERCENT_OFF", percent: null }],
      ["a buy n pay m promotion without quantities", { kind: "BUY_N_PAY_M", buy_qty: null }],
      ["a fractional percent", { kind: "PERCENT_OFF", percent: 10.5 }],
    ])("refuses a promotion with %s", (_case, benefit) => {
      const line = (sale().lines as Payload[])[0] as Payload;
      const promotion = { discount_id: "discount-1", buy_qty: null, pay_qty: null, ...benefit };

      expect(
        accepts("sale_completed", version, {
          ...sale(),
          lines: [{ ...line, promotions: [promotion] }],
        }),
      ).toBe(false);
    });

    it("refuses a cash movement missing any one of its fields", () => {
      const withMovements = firstSale();
      const movement = (withMovements.cash_movements as Payload[])[0] as Payload;

      const accepted = Object.keys(movement).filter((key) => {
        const { [key]: _removed, ...rest } = movement;
        return accepts("sale_completed", version, { ...withMovements, cash_movements: [rest] });
      });

      expect(accepted).toEqual([]);
    });

    it.each([
      ["a type cash movements of a sale never have", { type: "WITHDRAWAL" }],
      ["a fractional amount", { amount: 1.5 }],
      ["a negative amount", { amount: -1 }],
    ])("refuses a cash movement with %s", (_case, change) => {
      const withMovements = firstSale();
      const movement = (withMovements.cash_movements as Payload[])[0] as Payload;

      expect(
        accepts("sale_completed", version, {
          ...withMovements,
          cash_movements: [{ ...movement, ...change }],
        }),
      ).toBe(false);
    });

    it.each(["SALE", "CHANGE", "REFUND"])("accepts a %s cash movement", (type) => {
      const withMovements = firstSale();
      const movement = (withMovements.cash_movements as Payload[])[0] as Payload;

      expect(
        accepts("sale_completed", version, {
          ...withMovements,
          cash_movements: [{ ...movement, type }],
        }),
      ).toBe(true);
    });
  });

  describe("sale_completed v1", () => {
    const sale = () => recordedPayload("sale_completed", 1);

    it("needs the instant the sale was completed", () => {
      const { completed_at: _removed, ...rest } = sale();

      expect(accepts("sale_completed", 1, rest)).toBe(false);
    });

    it("accepts cash payments recorded before transfers existed, without an authorizer or a confirmation", () => {
      expect(accepts("sale_completed", 1, { ...sale(), payments: [PAYMENT_V1] })).toBe(true);
    });
  });

  describe("sale_completed v2", () => {
    const sale = () => recordedPayload("sale_completed", 2);

    it("describes a sale paid with cash and a transfer", () => {
      expect(
        accepts("sale_completed", 2, {
          ...sale(),
          payments: [CASH_PAYMENT_V2, TRANSFER_PAYMENT_V2],
        }),
      ).toBe(true);
    });

    it("refuses a transfer that nobody authorized", () => {
      const transfer = { ...TRANSFER_PAYMENT_V2, authorized_by: null };

      expect(accepts("sale_completed", 2, { ...sale(), payments: [transfer] })).toBe(false);
    });

    it("refuses a transfer that was never confirmed", () => {
      const transfer = { ...TRANSFER_PAYMENT_V2, confirmed_at: null };

      expect(accepts("sale_completed", 2, { ...sale(), payments: [transfer] })).toBe(false);
    });

    it("refuses a transfer with a tendered amount", () => {
      const transfer = { ...TRANSFER_PAYMENT_V2, tendered: 100 };

      expect(accepts("sale_completed", 2, { ...sale(), payments: [transfer] })).toBe(false);
    });

    it("refuses a cash payment that carries an authorizer", () => {
      const cash = { ...CASH_PAYMENT_V2, authorized_by: "user-2" };

      expect(accepts("sale_completed", 2, { ...sale(), payments: [cash] })).toBe(false);
    });

    it("refuses a cash payment that carries a confirmation", () => {
      const cash = { ...CASH_PAYMENT_V2, confirmed_at: "2026-10-06T11:21:00.000Z" };

      expect(accepts("sale_completed", 2, { ...sale(), payments: [cash] })).toBe(false);
    });
  });
});

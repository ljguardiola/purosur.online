import { preEmissionGateFailedEvent, RECEIPT_REPRINT_REASON_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { syncedEventPayloadKey, syncedEventPayloadSchema } from "./synced-event-payloads.js";
import { recordedEvents } from "./test-support/recorded-pushes.js";

type Payload = Record<string, unknown>;

function recordedPayload(eventType: string, schemaVersion: number, index = 0): Payload {
  const matching = recordedEvents().filter(
    (event) => event.event_type === eventType && event.schema_version === schemaVersion,
  );
  return structuredClone(matching[index]?.["payload"] as Payload);
}

function accepts(eventType: string, schemaVersion: number, payload: unknown): boolean {
  const key = syncedEventPayloadKey(eventType, schemaVersion);
  return key !== undefined && syncedEventPayloadSchema(key).safeParse(payload).success;
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

const CANCELLED_SALE_V1: Payload = {
  id: "sale-1",
  register_id: "register-1",
  device_id: "device-1",
  session_id: "session-1",
  actor_id: "cashier",
  authorized_by: null,
  occurred_at: "2026-10-07T15:30:00.000Z",
  total: 6750,
  lines: [
    {
      id: "line-1",
      product_id: "yerba",
      product_name: "Yerba 1 kg",
      quantity: 3,
      list_unit_price: 2500,
      price_list_id: "list-1",
      promotion_id: "ten",
      discount_amount: 750,
      promotions: [
        { discount_id: "ten", kind: "PERCENT_OFF", percent: 10, buy_qty: null, pay_qty: null },
      ],
      line_total: 6750,
    },
  ],
  payments: [{ ...CASH_PAYMENT_V2, amount: 1200, tendered: 1200 }],
  refunds: [
    {
      id: "refund-1",
      kind: "REFUND",
      parent_id: "pay-1",
      method: "CASH",
      provider: "NONE",
      amount: 1200,
      state: "APPROVED",
      occurred_at: "2026-10-07T15:30:00.000Z",
    },
  ],
  cash_movements: [
    {
      id: "movement-1",
      type: "SALE",
      amount: 1200,
      ref_type: "sale",
      ref_id: "sale-1",
      actor_id: "cashier",
      occurred_at: "2026-10-07T15:10:00.000Z",
    },
    {
      id: "movement-2",
      type: "REFUND",
      amount: 1200,
      ref_type: "sale",
      ref_id: "sale-1",
      actor_id: "cashier",
      occurred_at: "2026-10-07T15:30:00.000Z",
    },
  ],
};

describe("synced event payloads", () => {
  it("describes every event the registers pushed in the recorded pushes", () => {
    const refused = recordedEvents().filter(
      (event) => !accepts(event.event_type, event.schema_version, event["payload"]),
    );

    expect(refused).toEqual([]);
  });

  it("covers every event type and version the recorded pushes hold", () => {
    const pairs = new Set(recordedEvents().map((e) => [e.event_type, e.schema_version].join("@")));

    expect([...pairs].sort()).toEqual([
      "cash_movement_recorded@1",
      "cash_session_closed@1",
      "cash_session_opened@1",
      "fiscal_gate_failed@1",
      "reprint_recorded@1",
      "sale_cancelled@1",
      "sale_completed@1",
      "sale_completed@2",
      "sale_completed@3",
      "sale_completed@4",
      "sale_completed@5",
      "sale_print_state_changed@1",
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
    ["a sale_completed version nobody emitted", "sale_completed", 7],
    ["a sale_cancelled version nobody emitted", "sale_cancelled", 3],
    ["version zero", "sale_completed", 0],
    ["a cash_session_opened version nobody emitted", "cash_session_opened", 2],
    ["a cash_session_closed version nobody emitted", "cash_session_closed", 2],
    ["a cash_movement_recorded version nobody emitted", "cash_movement_recorded", 2],
    ["a fiscal_gate_failed version nobody emitted", "fiscal_gate_failed", 2],
    ["a prototype property name", "constructor", 1],
    ["a prototype property name as the version", "sale_completed", Number.NaN],
  ])("has no schema for %s", (_case, eventType, schemaVersion) => {
    expect(syncedEventPayloadKey(eventType, schemaVersion)).toBeUndefined();
  });

  it.each([
    ["cash_session_opened", 1],
    ["cash_session_closed", 1],
    ["cash_movement_recorded", 1],
    ["fiscal_gate_failed", 1],
    ["sale_completed", 1],
    ["sale_completed", 2],
    ["sale_completed", 3],
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
    ["sale_completed", 3],
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
    ["sale_completed", 3],
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

  describe("sale_completed v4", () => {
    const sale = (): Payload => recordedPayload("sale_completed", 4);

    it("accepts the sale a register numbered", () => {
      expect(accepts("sale_completed", 4, sale())).toBe(true);
    });

    it("accepts the number 1 and the highest number a register can count to", () => {
      expect(accepts("sale_completed", 4, { ...sale(), operation_number: 1 })).toBe(true);
      expect(accepts("sale_completed", 4, { ...sale(), operation_number: 2_147_483_647 })).toBe(
        true,
      );
    });

    it.each([0, -1, 1.5, "1", null])("refuses the operation number %s", (operationNumber) => {
      expect(accepts("sale_completed", 4, { ...sale(), operation_number: operationNumber })).toBe(
        false,
      );
    });

    it("refuses a sale without its operation number", () => {
      const { operation_number: _removed, ...rest } = sale();

      expect(accepts("sale_completed", 4, rest)).toBe(false);
    });

    it("refuses a sale without its stock movements", () => {
      const { stock_movements: _removed, ...rest } = sale();

      expect(accepts("sale_completed", 4, rest)).toBe(false);
    });

    it("keeps reading the sales of version 3, which carry no operation number", () => {
      const { operation_number: _removed, ...v3 } = sale();

      expect(accepts("sale_completed", 3, v3)).toBe(true);
    });
  });

  describe("sale_completed v5", () => {
    const sale = (): Payload => recordedPayload("sale_completed", 4);
    const QR_PAYMENT = {
      ...CASH_PAYMENT_V2,
      id: "pay-3",
      method: "QR",
      provider: "MERCADOPAGO_QR",
      tendered: null,
    };
    const withPayments = (payments: unknown[]) => ({ ...sale(), payments });

    it("accepts a sale paid by an approved Mercado Pago QR, alone or with other payments", () => {
      expect(accepts("sale_completed", 5, withPayments([QR_PAYMENT]))).toBe(true);
      expect(
        accepts(
          "sale_completed",
          5,
          withPayments([CASH_PAYMENT_V2, TRANSFER_PAYMENT_V2, QR_PAYMENT]),
        ),
      ).toBe(true);
    });

    it("keeps accepting the sales paid in cash or by transfer", () => {
      expect(accepts("sale_completed", 5, sale())).toBe(true);
      expect(accepts("sale_completed", 5, withPayments([TRANSFER_PAYMENT_V2]))).toBe(true);
    });

    it.each([
      ["a pending state", { state: "PENDING" }],
      ["another provider", { provider: "NONE" }],
      ["an amount tendered", { tendered: 5000 }],
      ["an authorizer", { authorized_by: "user-2" }],
      ["a confirmation", { confirmed_at: "2026-10-06T11:21:00.000Z" }],
    ])("refuses a QR payment with %s", (_description, change) => {
      expect(accepts("sale_completed", 5, withPayments([{ ...QR_PAYMENT, ...change }]))).toBe(
        false,
      );
    });

    it("refuses a cash payment with the Mercado Pago provider", () => {
      const cash = { ...CASH_PAYMENT_V2, provider: "MERCADOPAGO_QR" };

      expect(accepts("sale_completed", 5, withPayments([cash]))).toBe(false);
    });

    it.each([1, 2, 3, 4])("keeps refusing a QR payment in version %s", (version) => {
      const base = { ...sale(), completed_at: "2026-10-06T11:20:00.000Z" };

      expect(accepts("sale_completed", version, base)).toBe(true);
      expect(accepts("sale_completed", version, { ...base, payments: [QR_PAYMENT] })).toBe(false);
    });

    it("refuses a QR payment in a cancelled sale", () => {
      expect(accepts("sale_cancelled", 1, { ...CANCELLED_SALE_V1, payments: [QR_PAYMENT] })).toBe(
        false,
      );
    });
  });

  describe("a sale's lines recording the source of their weight", () => {
    const WEIGHED_LINE = {
      id: "line-2",
      product_id: "queso",
      product_name: "Queso cremoso",
      weight_source: "MANUAL",
      quantity: 1250,
      list_unit_price: 9000,
      price_list_id: "list-1",
      promotion_id: null,
      discount_amount: 0,
      promotions: [],
      line_total: 11250,
    };
    const completed = (): Payload => {
      const sale = recordedPayload("sale_completed", 5);
      const lines = (sale["lines"] as Payload[]).map((line) => ({ ...line, weight_source: null }));
      return { ...sale, lines };
    };
    const cancelled = (): Payload => ({
      ...CANCELLED_SALE_V1,
      lines: (CANCELLED_SALE_V1["lines"] as Payload[]).map((line) => ({
        ...line,
        weight_source: null,
      })),
    });
    const withLines = (sale: Payload, lines: Payload[]): Payload => ({
      ...sale,
      lines: [...(sale["lines"] as Payload[]), ...lines],
    });

    it.each([
      ["sale_completed", 6, completed],
      ["sale_cancelled", 2, cancelled],
    ])(
      "accepts a %s v%i whose lines are sold by the unit and record no weight source",
      (eventType, version, sale) => {
        expect(accepts(eventType, version, sale())).toBe(true);
      },
    );

    it.each(["SCALE", "MANUAL"])(
      "accepts a line sold by weight whose weight came from %s",
      (weightSource) => {
        const weighed = { ...WEIGHED_LINE, weight_source: weightSource };

        expect(accepts("sale_completed", 6, withLines(completed(), [weighed]))).toBe(true);
        expect(accepts("sale_cancelled", 2, withLines(cancelled(), [weighed]))).toBe(true);
      },
    );

    it.each([
      ["a weight source nobody records", { weight_source: "SENSOR" }],
      ["an empty weight source", { weight_source: "" }],
      ["a lowercase weight source", { weight_source: "manual" }],
    ])("refuses a line with %s", (_case, change) => {
      const line = { ...WEIGHED_LINE, ...change };

      expect(accepts("sale_completed", 6, withLines(completed(), [line]))).toBe(false);
      expect(accepts("sale_cancelled", 2, withLines(cancelled(), [line]))).toBe(false);
    });

    it("refuses a line without the field", () => {
      const { weight_source: _removed, ...line } = WEIGHED_LINE;

      expect(accepts("sale_completed", 6, withLines(completed(), [line]))).toBe(false);
      expect(accepts("sale_cancelled", 2, withLines(cancelled(), [line]))).toBe(false);
    });

    it.each([
      ["sale_completed", 5],
      ["sale_cancelled", 1],
    ])("keeps reading a %s v%i, whose lines carry no weight source", (eventType, version) => {
      const { weight_source: _removed, ...unit } = WEIGHED_LINE;
      const sale =
        eventType === "sale_completed"
          ? recordedPayload("sale_completed", 5)
          : structuredClone(CANCELLED_SALE_V1);

      expect(sale["lines"]).not.toContainEqual(
        expect.objectContaining({ weight_source: "MANUAL" }),
      );
      expect(accepts(eventType, version, sale)).toBe(true);
      expect(accepts(eventType, version, withLines(sale, [unit]))).toBe(true);
    });
  });

  describe("sale_print_state_changed v1", () => {
    const state = (): Payload => ({
      sale_id: "sale-1",
      print_attempted_at: "2026-10-06T11:21:00.000Z",
      printed_at: null,
    });

    it("accepts an attempt that was not printed yet", () => {
      expect(accepts("sale_print_state_changed", 1, state())).toBe(true);
    });

    it("accepts the attempt once it was printed", () => {
      expect(
        accepts("sale_print_state_changed", 1, {
          ...state(),
          printed_at: "2026-10-06T11:21:05.000Z",
        }),
      ).toBe(true);
    });

    it("refuses the state without any one of its fields", () => {
      for (const field of Object.keys(state())) {
        const { [field]: _removed, ...rest } = state();

        expect(accepts("sale_print_state_changed", 1, rest), field).toBe(false);
      }
    });

    it("refuses an attempt that is not an instant, a printing that is not an instant or null, and an empty sale", () => {
      expect(accepts("sale_print_state_changed", 1, { ...state(), print_attempted_at: null })).toBe(
        false,
      );
      expect(accepts("sale_print_state_changed", 1, { ...state(), printed_at: "now" })).toBe(false);
      expect(accepts("sale_print_state_changed", 1, { ...state(), sale_id: "" })).toBe(false);
    });
  });

  describe("reprint_recorded v1", () => {
    const retry = (): Payload => ({
      sale_id: "sale-1",
      order_number: 1,
      requested_by: "cashier",
      authorized_by: null,
      reason_kind: "retry",
      reason_text: null,
    });
    const requested = (): Payload => ({
      ...retry(),
      order_number: 2,
      authorized_by: "manager",
      reason_kind: "requested",
      reason_text: "El cliente la perdio",
    });

    it("accepts a retry and a requested copy with its reason", () => {
      expect(accepts("reprint_recorded", 1, retry())).toBe(true);
      expect(accepts("reprint_recorded", 1, requested())).toBe(true);
    });

    it("refuses a retry with a reason text and a requested copy without one", () => {
      expect(accepts("reprint_recorded", 1, { ...retry(), reason_text: "texto" })).toBe(false);
      expect(accepts("reprint_recorded", 1, { ...requested(), reason_text: null })).toBe(false);
      expect(accepts("reprint_recorded", 1, { ...requested(), reason_text: "" })).toBe(false);
    });

    it("accepts a reason text of the longest length and refuses a longer one", () => {
      const longest = "a".repeat(RECEIPT_REPRINT_REASON_MAX_LENGTH);

      expect(accepts("reprint_recorded", 1, { ...requested(), reason_text: longest })).toBe(true);
      expect(accepts("reprint_recorded", 1, { ...requested(), reason_text: `${longest}a` })).toBe(
        false,
      );
    });

    it("refuses a reason text the register would not have kept as typed", () => {
      expect(accepts("reprint_recorded", 1, { ...requested(), reason_text: " perdida" })).toBe(
        false,
      );
      expect(accepts("reprint_recorded", 1, { ...requested(), reason_text: "   " })).toBe(false);
    });

    it("counts the longest reason text in characters, not in code units", () => {
      const longest = "\u{1F600}".repeat(RECEIPT_REPRINT_REASON_MAX_LENGTH);

      expect(accepts("reprint_recorded", 1, { ...requested(), reason_text: longest })).toBe(true);
    });

    it("refuses a reason kind the register does not have", () => {
      expect(accepts("reprint_recorded", 1, { ...retry(), reason_kind: "other" })).toBe(false);
    });

    it("refuses an order number that is not a positive whole number", () => {
      for (const orderNumber of [0, -1, 1.5, "1"]) {
        expect(accepts("reprint_recorded", 1, { ...retry(), order_number: orderNumber })).toBe(
          false,
        );
      }
    });

    it("refuses the copy without any one of its fields", () => {
      for (const field of Object.keys(retry())) {
        const { [field]: _removed, ...rest } = retry();

        expect(accepts("reprint_recorded", 1, rest), field).toBe(false);
      }
    });
  });

  describe("sale_completed v3", () => {
    const MOVEMENT: Payload = {
      id: "stock-movement-1",
      sale_line_id: "line-1",
      product_id: "yerba",
      delta: -2000,
    };
    const sale = (): Payload => ({
      ...recordedPayload("sale_completed", 2),
      stock_movements: [MOVEMENT],
    });
    const withMovements = (movements: unknown[]) => ({ ...sale(), stock_movements: movements });

    it("accepts a sale v2 carries, plus the stock each line moved", () => {
      expect(accepts("sale_completed", 3, sale())).toBe(true);
    });

    it("refuses a sale without its stock movements", () => {
      const { stock_movements: _removed, ...rest } = sale();

      expect(accepts("sale_completed", 3, rest)).toBe(false);
    });

    it("refuses stock movements that are not a list", () => {
      expect(accepts("sale_completed", 3, { ...sale(), stock_movements: {} })).toBe(false);
    });

    it("refuses a stock movement missing any one of its fields", () => {
      const accepted = Object.keys(MOVEMENT).filter((key) => {
        const { [key]: _removed, ...rest } = MOVEMENT;
        return accepts("sale_completed", 3, withMovements([rest]));
      });

      expect(accepted).toEqual([]);
    });

    it.each([
      ["an empty id", { id: "" }],
      ["an empty sale line id", { sale_line_id: "" }],
      ["an empty product id", { product_id: "" }],
    ])("refuses a stock movement with %s", (_case, change) => {
      expect(accepts("sale_completed", 3, withMovements([{ ...MOVEMENT, ...change }]))).toBe(false);
    });

    it.each([
      ["nothing", 0],
      ["stock added", 1000],
      ["a fractional quantity", -0.5],
      ["a quantity no movement may carry", -2_147_483_648],
    ])("refuses a stock movement of %s", (_case, delta) => {
      expect(accepts("sale_completed", 3, withMovements([{ ...MOVEMENT, delta }]))).toBe(false);
    });

    it("accepts a stock movement of the most a movement may carry", () => {
      expect(
        accepts("sale_completed", 3, withMovements([{ ...MOVEMENT, delta: -2_147_483_647 }])),
      ).toBe(true);
    });
  });

  describe.each([
    [1, "completed_at"],
    [2, "occurred_at"],
    [3, "occurred_at"],
  ])("sale_completed v%i", (version, _dateField) => {
    const sale = () => recordedPayload("sale_completed", version);
    const salePayment = (): Payload => (sale()["payments"] as Payload[])[0] as Payload;
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
      const line = (sale()["lines"] as Payload[])[0] as Payload;

      const accepted = Object.keys(line).filter((key) => {
        const { [key]: _removed, ...rest } = line;
        return accepts("sale_completed", version, { ...sale(), lines: [rest] });
      });

      expect(accepted).toEqual([]);
    });

    it("refuses a line with a fractional quantity", () => {
      const line = (sale()["lines"] as Payload[])[0] as Payload;

      expect(
        accepts("sale_completed", version, { ...sale(), lines: [{ ...line, quantity: 1.5 }] }),
      ).toBe(false);
    });

    it("refuses a line with a zero quantity", () => {
      const line = (sale()["lines"] as Payload[])[0] as Payload;

      expect(
        accepts("sale_completed", version, { ...sale(), lines: [{ ...line, quantity: 0 }] }),
      ).toBe(false);
    });

    it.each([
      ["a negative price", { list_unit_price: -1 }],
      ["a negative discount", { discount_amount: -1 }],
      ["a fractional line total", { line_total: 1.5 }],
    ])("refuses a line with %s", (_case, change) => {
      const line = (sale()["lines"] as Payload[])[0] as Payload;

      expect(
        accepts("sale_completed", version, { ...sale(), lines: [{ ...line, ...change }] }),
      ).toBe(false);
    });

    it("accepts a line without promotions or a promotion id", () => {
      const line = (sale()["lines"] as Payload[])[0] as Payload;

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
      const line = (sale()["lines"] as Payload[])[0] as Payload;
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
      const line = (sale()["lines"] as Payload[])[0] as Payload;
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
      const movement = (withMovements["cash_movements"] as Payload[])[0] as Payload;

      const accepted = Object.keys(movement).filter((key) => {
        const { [key]: _removed, ...rest } = movement;
        return accepts("sale_completed", version, { ...withMovements, cash_movements: [rest] });
      });

      expect(accepted).toEqual([]);
    });

    it.each([
      ["a type no cash movement has", { type: "TIP" }],
      ["a fractional amount", { amount: 1.5 }],
      ["a negative amount", { amount: -1 }],
    ])("refuses a cash movement with %s", (_case, change) => {
      const withMovements = firstSale();
      const movement = (withMovements["cash_movements"] as Payload[])[0] as Payload;

      expect(
        accepts("sale_completed", version, {
          ...withMovements,
          cash_movements: [{ ...movement, ...change }],
        }),
      ).toBe(false);
    });

    it.each(["SALE", "CHANGE", "REFUND"])("accepts a %s cash movement", (type) => {
      const withMovements = firstSale();
      const movement = (withMovements["cash_movements"] as Payload[])[0] as Payload;

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

describe("sale_cancelled v1", () => {
  const cancelled = (): Payload => structuredClone(CANCELLED_SALE_V1);
  const refund = (): Payload => (cancelled()["refunds"] as Payload[])[0] as Payload;
  const TRANSFER_REFUND = {
    id: "refund-2",
    kind: "REFUND",
    parent_id: "pay-2",
    method: "TRANSFER",
    provider: "NONE",
    amount: 2000,
    state: "PENDING",
    occurred_at: "2026-10-07T15:30:00.000Z",
  };

  it("is described by a payload with the sale, its payments, its refunds and its cash movements", () => {
    expect(accepts("sale_cancelled", 1, cancelled())).toBe(true);
  });

  it("describes a sale paid in cash and by transfer, refunded by each method", () => {
    expect(
      accepts("sale_cancelled", 1, {
        ...cancelled(),
        payments: [CASH_PAYMENT_V2, TRANSFER_PAYMENT_V2],
        refunds: [refund(), TRANSFER_REFUND],
      }),
    ).toBe(true);
  });

  it("describes the person who authorized the cancellation", () => {
    expect(accepts("sale_cancelled", 1, { ...cancelled(), authorized_by: "supervisor" })).toBe(
      true,
    );
  });

  it("refuses the payload without any one of its fields", () => {
    const payload = cancelled();

    const accepted = Object.keys(payload).filter((key) => {
      const { [key]: _removed, ...rest } = payload;
      return accepts("sale_cancelled", 1, rest);
    });

    expect(accepted).toEqual([]);
  });

  it("refuses the payload with any one of its fields of the wrong type", () => {
    const payload = cancelled();

    const accepted = Object.keys(payload).filter((key) =>
      accepts("sale_cancelled", 1, { ...payload, [key]: { unexpected: true } }),
    );

    expect(accepted).toEqual([]);
  });

  it("refuses a payload that is not an object", () => {
    expect(accepts("sale_cancelled", 1, null)).toBe(false);
    expect(accepts("sale_cancelled", 1, [])).toBe(false);
  });

  it("refuses a version nobody emitted", () => {
    expect(syncedEventPayloadKey("sale_cancelled", 2)).toBeUndefined();
  });

  it("refuses a cancelled sale without payments", () => {
    expect(accepts("sale_cancelled", 1, { ...cancelled(), payments: [] })).toBe(false);
  });

  it("refuses a cancelled sale without refunds", () => {
    expect(accepts("sale_cancelled", 1, { ...cancelled(), refunds: [] })).toBe(false);
  });

  it("accepts cash movements that are none", () => {
    expect(
      accepts("sale_cancelled", 1, {
        ...cancelled(),
        payments: [TRANSFER_PAYMENT_V2],
        refunds: [TRANSFER_REFUND],
        cash_movements: [],
      }),
    ).toBe(true);
  });

  it("refuses a refund missing any one of its fields", () => {
    const one = refund();

    const accepted = Object.keys(one).filter((key) => {
      const { [key]: _removed, ...rest } = one;
      return accepts("sale_cancelled", 1, { ...cancelled(), refunds: [rest] });
    });

    expect(accepted).toEqual([]);
  });

  it.each([
    ["a kind that is not a refund", { kind: "SALE" }],
    ["a method that is not cash or transfer", { method: "CARD" }],
    ["a provider other than none", { provider: "TERMINAL" }],
    ["a cash refund that is pending", { state: "PENDING" }],
    ["a fractional amount", { amount: 0.5 }],
    ["a negative amount", { amount: -1 }],
    ["a date that is not ISO", { occurred_at: "now" }],
    ["an empty payment id", { parent_id: "" }],
  ])("refuses a refund with %s", (_case, change) => {
    expect(
      accepts("sale_cancelled", 1, { ...cancelled(), refunds: [{ ...refund(), ...change }] }),
    ).toBe(false);
  });

  it.each([
    ["a transfer refund already approved", { state: "APPROVED" }],
    ["a transfer refund with another state", { state: "REJECTED" }],
  ])("refuses %s", (_case, change) => {
    expect(
      accepts("sale_cancelled", 1, {
        ...cancelled(),
        refunds: [{ ...TRANSFER_REFUND, ...change }],
      }),
    ).toBe(false);
  });

  it("refuses a payment that is not approved", () => {
    const payment = { ...CASH_PAYMENT_V2, state: "PENDING" };

    expect(accepts("sale_cancelled", 1, { ...cancelled(), payments: [payment] })).toBe(false);
  });

  it("refuses a transfer payment nobody authorized", () => {
    const transfer = { ...TRANSFER_PAYMENT_V2, authorized_by: null };

    expect(accepts("sale_cancelled", 1, { ...cancelled(), payments: [transfer] })).toBe(false);
  });

  it("refuses an authorizer that is not text or null", () => {
    expect(accepts("sale_cancelled", 1, { ...cancelled(), authorized_by: 7 })).toBe(false);
  });

  it.each([
    ["a fractional total", { total: 10.5 }],
    ["a negative total", { total: -1 }],
    ["a date that is not ISO", { occurred_at: "today" }],
    ["lines that are not a list", { lines: {} }],
  ])("refuses a payload with %s", (_case, change) => {
    expect(accepts("sale_cancelled", 1, { ...cancelled(), ...change })).toBe(false);
  });

  it("accepts a REFUND cash movement and refuses a type no cash movement has", () => {
    const movement = (type: string) => ({
      ...(cancelled()["cash_movements"] as Payload[])[1],
      type,
    });

    expect(
      accepts("sale_cancelled", 1, { ...cancelled(), cash_movements: [movement("REFUND")] }),
    ).toBe(true);
    expect(
      accepts("sale_cancelled", 1, { ...cancelled(), cash_movements: [movement("TIP")] }),
    ).toBe(false);
  });

  it("refuses a line with a zero quantity", () => {
    const line = (cancelled()["lines"] as Payload[])[0] as Payload;

    expect(
      accepts("sale_cancelled", 1, { ...cancelled(), lines: [{ ...line, quantity: 0 }] }),
    ).toBe(false);
  });
});

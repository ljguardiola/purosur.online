import {
  clockCorrectedEvent,
  DEFERRAL_REASONS,
  deferredSaleRecordedEvent,
  MAX_STOCK_QUANTITY,
  MAX_UNIT_PRICE_CENTS,
  offlineFiscalDocument,
  offlineFiscalDocumentIssuedEvent,
  preEmissionGateFailedEvent,
  RECEIPT_REPRINT_REASON_MAX_LENGTH,
} from "@purosur/domain";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import {
  READABLE_EVENT_VERSIONS,
  syncedEventPayloadKey,
  syncedEventPayloadSchema,
} from "./synced-event-payloads.js";
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
      "clock_corrected@1",
      "clock_corrected@2",
      "deferred_sale_recorded@1",
      "fiscal_gate_failed@1",
      "offline_fiscal_document_issued@1",
      "offline_fiscal_document_issued@2",
      "opening_count_recorded@1",
      "opening_count_withdrawn@1",
      "qr_payment_replaced@1",
      "reprint_recorded@1",
      "sale_cancelled@1",
      "sale_cancelled@2",
      "sale_cancelled@3",
      "sale_cancelled@4",
      "sale_cancelled@5",
      "sale_cancelled@6",
      "sale_cancelled@7",
      "sale_completed@1",
      "sale_completed@2",
      "sale_completed@3",
      "sale_completed@4",
      "sale_completed@5",
      "sale_completed@6",
      "sale_completed@7",
      "sale_completed@8",
      "sale_print_state_changed@1",
      "sale_voided@1",
      "sale_voided@2",
      "sale_voided@3",
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

  it("has a schema for the event of a document issued under a pre-obtained code", () => {
    expect(syncedEventPayloadKey("offline_fiscal_document_issued", 1)).toBe(
      "offline_fiscal_document_issued@1",
    );
    expect(syncedEventPayloadKey("offline_fiscal_document_issued", 2)).toBe(
      "offline_fiscal_document_issued@2",
    );
    expect(syncedEventPayloadKey("offline_fiscal_document_issued", 3)).toBeUndefined();
  });

  it.each([
    ["an unknown event type", "sale_opened", 1],
    ["a sale_completed version nobody emitted", "sale_completed", 9],
    ["a sale_cancelled version nobody emitted", "sale_cancelled", 8],
    ["a sale_voided version nobody emitted", "sale_voided", 4],
    ["version zero", "sale_completed", 0],
    ["a cash_session_opened version nobody emitted", "cash_session_opened", 2],
    ["a cash_session_closed version nobody emitted", "cash_session_closed", 2],
    ["a cash_movement_recorded version nobody emitted", "cash_movement_recorded", 2],
    ["a fiscal_gate_failed version nobody emitted", "fiscal_gate_failed", 2],
    ["a deferred_sale_recorded version nobody emitted", "deferred_sale_recorded", 2],
    ["a qr_payment_replaced version nobody emitted", "qr_payment_replaced", 2],
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
    ["qr_payment_replaced", 1],
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
    ["qr_payment_replaced", 1],
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
    ["qr_payment_replaced", 1],
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

  describe("deferred_sale_recorded v1", () => {
    const { payload: recorded } = deferredSaleRecordedEvent({
      eventId: "event-1",
      registerId: "register-1",
      actorId: "cashier",
      deferredSale: {
        id: "deferred-1",
        saleId: "sale-1",
        occurredAt: new Date("2026-10-06T11:19:58.000Z"),
        total: 12_500,
        reason: "unclear_outcome",
        shortCode: "7KQ4M2P9",
        routedAt: new Date("2026-10-06T11:20:00.000Z"),
      },
    });

    it("describes the deferred sale record the domain builds", () => {
      expect(accepts("deferred_sale_recorded", 1, recorded)).toBe(true);
    });

    it.each(DEFERRAL_REASONS)("accepts the reason %s", (reason) => {
      expect(accepts("deferred_sale_recorded", 1, { ...recorded, reason })).toBe(true);
    });

    it("refuses a reason the deferral does not have", () => {
      expect(accepts("deferred_sale_recorded", 1, { ...recorded, reason: "other" })).toBe(false);
    });

    it.each([
      ["a sale date that is not ISO", { occurred_at: "yesterday" }],
      ["a routing date that is not ISO", { routed_at: "now" }],
      ["a negative total", { total: -1 }],
      ["a fractional total", { total: 1.5 }],
      ["an empty short code", { short_code: "" }],
      ["a short code the domain does not draw", { short_code: "7kq4m2p9" }],
    ])("refuses %s", (_case, change) => {
      expect(accepts("deferred_sale_recorded", 1, { ...recorded, ...change })).toBe(false);
    });

    it("refuses it without any one of its fields", () => {
      const accepted = Object.keys(recorded).filter((key) => {
        const { [key]: _removed, ...rest } = recorded;
        return accepts("deferred_sale_recorded", 1, rest);
      });

      expect(accepted).toEqual([]);
    });

    it("refuses it with any one of its fields of the wrong type", () => {
      const accepted = Object.keys(recorded).filter((key) =>
        accepts("deferred_sale_recorded", 1, { ...recorded, [key]: { unexpected: true } }),
      );

      expect(accepted).toEqual([]);
    });

    it("refuses it when it is not an object", () => {
      expect(accepts("deferred_sale_recorded", 1, null)).toBe(false);
      expect(accepts("deferred_sale_recorded", 1, [])).toBe(false);
    });
  });

  describe("offline_fiscal_document_issued", () => {
    const { payload: issued } = offlineFiscalDocumentIssuedEvent({
      eventId: "event-1",
      registerId: "register-1",
      actorId: "cashier",
      document: offlineFiscalDocument({
        id: "fiscal-document-1",
        saleId: "sale-1",
        pointOfSale: 7,
        number: 101,
        issuedOn: "2026-10-15",
        generatedAt: new Date("2026-10-16T03:00:01.000Z"),
        offlineAuthorizationCode: "71234567890123",
        fortnight: { start: "2026-10-01", end: "2026-10-15" },
        document: {
          invoiceClass: "C",
          total: 12_500,
          netAmount: 12_500,
          vatAmount: 0,
          issuer: {
            legalName: FICTIONAL_LEGAL_NAME,
            cuit: FICTIONAL_CUIT,
            taxStatus: "MONOTRIBUTO",
            grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
            activityStartDate: "2020-01-01",
            version: 3,
          },
          buyerTaxStatusCode: 5,
          buyerTaxStatusDescription: "Consumidor Final",
        },
        cause: "no_connectivity",
      }),
    });
    const { document: _invoice, ...version1 } = issued as Payload;
    const offline = (change: Payload = {}) => ({ ...version1, ...change });
    const offlineWithInvoice = (change: Payload = {}) => ({ ...(issued as Payload), ...change });
    const invoice = (change: Payload = {}) => ({ ...(issued["document"] as Payload), ...change });
    const issuer = (change: Payload = {}) => ({
      ...((issued["document"] as Payload)["issuer"] as Payload),
      ...change,
    });

    it("describes the event the domain drafts for a document issued under a pre-obtained code", () => {
      expect(accepts("offline_fiscal_document_issued", 1, offline())).toBe(true);
      expect(accepts("offline_fiscal_document_issued", 2, offlineWithInvoice())).toBe(true);
    });

    it("keeps reading the version 1 payload recorded before the invoice was carried", () => {
      expect(offline()).not.toHaveProperty("document");
      expect(accepts("offline_fiscal_document_issued", 1, offline())).toBe(true);
    });

    it.each(Object.keys(version1))("refuses a version 1 payload without its %s", (field) => {
      const { [field]: _removed, ...rest } = offline();
      expect(accepts("offline_fiscal_document_issued", 1, rest)).toBe(false);
    });

    it.each(Object.keys(issued))("refuses a version 2 payload without its %s", (field) => {
      const { [field]: _removed, ...rest } = offlineWithInvoice();
      expect(accepts("offline_fiscal_document_issued", 2, rest)).toBe(false);
    });

    it.each(Object.keys(issued["document"] as Payload))(
      "refuses a version 2 invoice without its %s",
      (field) => {
        const { [field]: _removed, ...rest } = invoice();
        expect(
          accepts("offline_fiscal_document_issued", 2, offlineWithInvoice({ document: rest })),
        ).toBe(false);
      },
    );

    it.each([
      "legal_name",
      "cuit",
      "tax_status",
      "gross_income_registration",
      "activity_start_date",
      "version",
    ])("refuses a version 2 invoice whose issuer lacks its %s", (field) => {
      const { [field]: _removed, ...rest } = issuer();
      expect(
        accepts(
          "offline_fiscal_document_issued",
          2,
          offlineWithInvoice({ document: invoice({ issuer: rest }) }),
        ),
      ).toBe(false);
    });

    it.each([
      ["an invoice class other than C", { invoice_class: "A" }],
      ["a VAT amount above zero", { vat_amount: 21 }],
      ["a fractional total", { total: 10.5 }],
      ["a negative net amount", { net_amount: -1 }],
      ["a buyer tax status code that is not a number", { buyer_tax_status_code: "5" }],
      ["an issuer that is not a record", { issuer: "someone" }],
    ])("refuses a version 2 invoice with %s", (_case, change) => {
      expect(
        accepts(
          "offline_fiscal_document_issued",
          2,
          offlineWithInvoice({ document: invoice(change) }),
        ),
      ).toBe(false);
    });

    it.each([
      ["an activity start date that is not a calendar day", { activity_start_date: "2020-13-01" }],
      ["an issuer version that is fractional", { version: 1.5 }],
      ["an issuer legal name that is a number", { legal_name: 7 }],
    ])("refuses a version 2 invoice whose issuer has %s", (_case, change) => {
      expect(
        accepts(
          "offline_fiscal_document_issued",
          2,
          offlineWithInvoice({ document: invoice({ issuer: issuer(change) }) }),
        ),
      ).toBe(false);
    });

    it.each([
      ["a cause nobody recorded", { cause: "tired" }],
      ["a generation stamp that is not fourteen digits", { generation_stamp: "2026-10-16" }],
      ["a generation stamp with text before its digits", { generation_stamp: "x20261016113600" }],
      ["a generation stamp with text after its digits", { generation_stamp: "20261016113600x" }],
      ["a generation moment that is not an instant", { generated_at: "yesterday" }],
      ["an issue date that is not a calendar day", { issued_on: "2026-13-01" }],
      ["a fortnight start that is not a calendar day", { fortnight_start: "soon" }],
      ["a fractional total", { total: 10.5 }],
      ["a negative net amount", { net_amount: -1 }],
      ["a point of sale the tax authority does not allow", { point_of_sale: 0 }],
      ["a number that is not positive", { number: 0 }],
      ["a document type other than factura C", { document_type: "factura_a" }],
    ])("refuses %s", (_case, change) => {
      expect(accepts("offline_fiscal_document_issued", 1, offline(change))).toBe(false);
    });

    it.each(["no_connectivity", "unclear_outcome", "numbering_conflict", "clock_correction_lapse"])(
      "accepts the cause %s",
      (cause) => {
        expect(accepts("offline_fiscal_document_issued", 1, offline({ cause }))).toBe(true);
      },
    );
  });

  describe("clock_corrected v1", () => {
    const { payload: corrected } = clockCorrectedEvent({
      eventId: "event-1",
      registerId: "register-1",
      actorId: "user-1",
      lowering: {
        pointOfSale: 12,
        documentType: "factura_c",
        previousReading: new Date("2026-10-03T12:00:00.000Z"),
        previousReadingSource: "clock_mark",
        correctedReading: new Date("2026-10-01T12:00:00.000Z"),
      },
    });
    const { previous_reading_source: _source, ...recordedByRegistersInTheField } =
      corrected as Payload;
    const clock = (change: Payload = {}) => ({ ...recordedByRegistersInTheField, ...change });

    it("has a schema for version 1", () => {
      expect(syncedEventPayloadKey("clock_corrected", 1)).toBe("clock_corrected@1");
    });

    it("describes the event a register in the field sent for a lowered mark", () => {
      expect(accepts("clock_corrected", 1, clock())).toBe(true);
    });

    it.each(Object.keys(recordedByRegistersInTheField))(
      "refuses a payload without its %s",
      (field) => {
        const { [field]: _removed, ...rest } = clock();
        expect(accepts("clock_corrected", 1, rest)).toBe(false);
      },
    );

    it.each([
      ["a point of sale the tax authority does not allow", { point_of_sale: 0 }],
      ["a document type other than factura C", { document_type: "factura_a" }],
      ["a previous reading that is not an instant", { previous_reading: "yesterday" }],
      ["a corrected reading that is not an instant", { corrected_reading: 1 }],
    ])("refuses %s", (_case, change) => {
      expect(accepts("clock_corrected", 1, clock(change))).toBe(false);
    });
  });

  describe("clock_corrected v2", () => {
    const { payload: corrected } = clockCorrectedEvent({
      eventId: "event-1",
      registerId: "register-1",
      actorId: "user-1",
      lowering: {
        pointOfSale: 12,
        documentType: "factura_c",
        previousReading: new Date("2026-10-03T12:00:00.000Z"),
        previousReadingSource: "clock_mark",
        correctedReading: new Date("2026-10-01T12:00:00.000Z"),
      },
    });
    const clock = (change: Payload = {}) => ({ ...(corrected as Payload), ...change });

    it("has a schema for versions 1 and 2 only", () => {
      expect(syncedEventPayloadKey("clock_corrected", 2)).toBe("clock_corrected@2");
      expect(syncedEventPayloadKey("clock_corrected", 3)).toBeUndefined();
    });

    it("describes the event the domain drafts for a lowering", () => {
      expect(accepts("clock_corrected", 2, clock())).toBe(true);
    });

    it.each(["clock_mark", "tax_authority_day"])(
      "accepts %s as the source of the previous reading",
      (source) => {
        expect(accepts("clock_corrected", 2, clock({ previous_reading_source: source }))).toBe(
          true,
        );
      },
    );

    it.each(Object.keys(corrected))("refuses a payload without its %s", (field) => {
      const { [field]: _removed, ...rest } = clock();
      expect(accepts("clock_corrected", 2, rest)).toBe(false);
    });

    it.each([
      ["a source it does not know", { previous_reading_source: "register" }],
      ["a source that is not text", { previous_reading_source: 1 }],
      ["a point of sale the tax authority does not allow", { point_of_sale: 0 }],
      ["a previous reading that is not an instant", { previous_reading: "yesterday" }],
    ])("refuses %s", (_case, change) => {
      expect(accepts("clock_corrected", 2, clock(change))).toBe(false);
    });
  });

  describe("qr_payment_replaced v1", () => {
    const replaced = () => recordedPayload("qr_payment_replaced", 1);

    it("refuses an empty payment transaction id or sale id", () => {
      expect(accepts("qr_payment_replaced", 1, { ...replaced(), payment_transaction_id: "" })).toBe(
        false,
      );
      expect(accepts("qr_payment_replaced", 1, { ...replaced(), sale_id: "" })).toBe(false);
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

  describe("a sale paid on the integrated terminal", () => {
    const sale = (): Payload => recordedPayload("sale_completed", 8);
    const POINT_PAYMENT = {
      ...CASH_PAYMENT_V2,
      id: "pay-4",
      method: "POINT",
      provider: "MERCADOPAGO_POINT",
      tendered: null,
    };
    const withPayments = (payments: unknown[]) => ({ ...sale(), payments });

    it("accepts a sale paid by an approved Mercado Pago Point, alone or with other payments", () => {
      expect(accepts("sale_completed", 8, withPayments([POINT_PAYMENT]))).toBe(true);
      expect(
        accepts(
          "sale_completed",
          8,
          withPayments([CASH_PAYMENT_V2, TRANSFER_PAYMENT_V2, POINT_PAYMENT]),
        ),
      ).toBe(true);
    });

    it("keeps accepting the sales paid by QR in the same version", () => {
      const qr = { ...POINT_PAYMENT, method: "QR", provider: "MERCADOPAGO_QR" };

      expect(accepts("sale_completed", 8, withPayments([qr]))).toBe(true);
    });

    it.each([
      ["a pending state", { state: "PENDING" }],
      ["another provider", { provider: "NONE" }],
      ["the QR provider", { provider: "MERCADOPAGO_QR" }],
      ["an amount tendered", { tendered: 5000 }],
      ["an authorizer", { authorized_by: "user-2" }],
      ["a confirmation", { confirmed_at: "2026-10-06T11:21:00.000Z" }],
    ])("refuses a Point payment with %s", (_description, change) => {
      expect(accepts("sale_completed", 8, withPayments([{ ...POINT_PAYMENT, ...change }]))).toBe(
        false,
      );
    });

    it("drops whatever a Point payment says about the card that paid", () => {
      const parsed = syncedEventPayloadSchema("sale_completed@8").parse(
        withPayments([{ ...POINT_PAYMENT, card_last_digits: "4242", card_brand: "visa" }]),
      );

      expect(parsed.payments[0]).not.toHaveProperty("card_last_digits");
      expect(parsed.payments[0]).not.toHaveProperty("card_brand");
    });

    it("refuses a QR payment with the Point provider", () => {
      const qr = { ...POINT_PAYMENT, method: "QR" };

      expect(accepts("sale_completed", 8, withPayments([qr]))).toBe(false);
    });

    it.each([1, 2, 3, 4, 5, 6, 7])("keeps refusing a Point payment in version %s", (version) => {
      const base = { ...sale(), completed_at: "2026-10-06T11:20:00.000Z" };

      expect(accepts("sale_completed", version, { ...base, payments: [POINT_PAYMENT] })).toBe(
        false,
      );
    });

    it("refuses a Point payment in a cancelled sale", () => {
      expect(
        accepts("sale_cancelled", 4, {
          ...recordedPayload("sale_cancelled", 4),
          payments: [POINT_PAYMENT],
        }),
      ).toBe(false);
    });
  });

  describe("a sale paid on the standalone terminal", () => {
    const sale = (): Payload => recordedPayload("sale_completed", 8);
    const STANDALONE_PAYMENT = {
      ...CASH_PAYMENT_V2,
      id: "pay-5",
      method: "STANDALONE_TERMINAL",
      provider: "EXTERNAL_TERMINAL",
      tendered: null,
      authorized_by: "user-2",
      confirmed_at: "2026-10-06T11:21:00.000Z",
    };
    const withPayments = (payments: unknown[]) => ({ ...sale(), payments });

    it("accepts a sale paid on the standalone terminal, alone or with other payments", () => {
      expect(accepts("sale_completed", 8, withPayments([STANDALONE_PAYMENT]))).toBe(true);
      expect(
        accepts(
          "sale_completed",
          8,
          withPayments([CASH_PAYMENT_V2, TRANSFER_PAYMENT_V2, STANDALONE_PAYMENT]),
        ),
      ).toBe(true);
    });

    it.each([
      ["a pending state", { state: "PENDING" }],
      ["another provider", { provider: "NONE" }],
      ["a Mercado Pago provider", { provider: "MERCADOPAGO_POINT" }],
      ["an amount tendered", { tendered: 5000 }],
      ["no authorizer", { authorized_by: null }],
      ["no confirmation", { confirmed_at: null }],
      ["a confirmation that is no instant", { confirmed_at: "yesterday" }],
    ])("refuses a standalone terminal payment with %s", (_description, change) => {
      expect(
        accepts("sale_completed", 8, withPayments([{ ...STANDALONE_PAYMENT, ...change }])),
      ).toBe(false);
    });

    it("refuses a transfer on the external terminal provider", () => {
      const transfer = { ...TRANSFER_PAYMENT_V2, provider: "EXTERNAL_TERMINAL" };

      expect(accepts("sale_completed", 8, withPayments([transfer]))).toBe(false);
    });

    it.each([1, 2, 3, 4, 5, 6, 7])(
      "keeps refusing a standalone terminal payment in version %s",
      (version) => {
        const base = { ...sale(), completed_at: "2026-10-06T11:20:00.000Z" };

        expect(
          accepts("sale_completed", version, { ...base, payments: [STANDALONE_PAYMENT] }),
        ).toBe(false);
      },
    );
  });

  describe("a sale cancelled after being paid on the standalone terminal", () => {
    const cancelled = (): Payload => recordedPayload("sale_cancelled", 5, 1);
    const STANDALONE_PAYMENT = {
      ...CASH_PAYMENT_V2,
      id: "pay-5",
      method: "STANDALONE_TERMINAL",
      provider: "EXTERNAL_TERMINAL",
      tendered: null,
      authorized_by: "user-2",
      confirmed_at: "2026-10-06T11:21:00.000Z",
    };
    const REFUND = {
      id: "refund-5",
      kind: "REFUND",
      parent_id: "pay-5",
      method: "STANDALONE_TERMINAL",
      provider: "EXTERNAL_TERMINAL",
      amount: 2700,
      state: "PENDING",
      occurred_at: "2026-10-06T11:30:00.000Z",
    };
    const CASH_REFUND = {
      ...REFUND,
      id: "refund-1",
      parent_id: "pay-1",
      method: "CASH",
      provider: "NONE",
      state: "APPROVED",
    };

    it("accepts the standalone terminal payment with its pending refund, alone or beside a cash one", () => {
      expect(accepts("sale_cancelled", 5, cancelled())).toBe(true);
      expect(
        accepts("sale_cancelled", 5, {
          ...cancelled(),
          payments: [CASH_PAYMENT_V2, STANDALONE_PAYMENT],
          refunds: [CASH_REFUND, REFUND],
        }),
      ).toBe(true);
    });

    it.each([
      ["an approved state", { state: "APPROVED" }],
      ["the none provider", { provider: "NONE" }],
      ["a Mercado Pago provider", { provider: "MERCADOPAGO_POINT" }],
      ["a negative amount", { amount: -1 }],
    ])("refuses a standalone terminal refund with %s", (_description, change) => {
      expect(
        accepts("sale_cancelled", 5, { ...cancelled(), refunds: [{ ...REFUND, ...change }] }),
      ).toBe(false);
    });

    it.each([
      ["a transfer refund on the external terminal provider", { method: "TRANSFER" }],
      ["a cash refund on the external terminal provider", { method: "CASH", state: "APPROVED" }],
    ])("refuses %s", (_description, change) => {
      expect(
        accepts("sale_cancelled", 5, { ...cancelled(), refunds: [{ ...REFUND, ...change }] }),
      ).toBe(false);
    });

    it("refuses a cash refund that is pending", () => {
      expect(
        accepts("sale_cancelled", 5, {
          ...cancelled(),
          refunds: [{ ...CASH_REFUND, state: "PENDING" }],
        }),
      ).toBe(false);
    });

    it.each([
      ["a Point payment", { method: "POINT", provider: "MERCADOPAGO_POINT" }],
      ["a QR payment", { method: "QR", provider: "MERCADOPAGO_QR" }],
    ])("refuses a cancelled sale holding %s", (_description, change) => {
      expect(
        accepts("sale_cancelled", 5, {
          ...cancelled(),
          payments: [{ ...STANDALONE_PAYMENT, ...change, authorized_by: null, confirmed_at: null }],
        }),
      ).toBe(false);
    });

    it.each([1, 2, 3, 4])("keeps refusing the standalone terminal payment in version %s", (v) => {
      expect(
        accepts("sale_cancelled", v, {
          ...recordedPayload("sale_cancelled", v),
          payments: [STANDALONE_PAYMENT],
        }),
      ).toBe(false);
    });

    it.each([1, 2, 3, 4])("keeps refusing the standalone terminal refund in version %s", (v) => {
      expect(
        accepts("sale_cancelled", v, {
          ...recordedPayload("sale_cancelled", v),
          refunds: [REFUND],
        }),
      ).toBe(false);
    });
  });

  describe("a sale cancelled after being paid by Mercado Pago QR", () => {
    const cancelled = (): Payload => recordedPayload("sale_cancelled", 6);
    const QR_PAYMENT = {
      ...CASH_PAYMENT_V2,
      id: "pay-3",
      method: "QR",
      provider: "MERCADOPAGO_QR",
      tendered: null,
    };
    const REFUND = {
      id: "refund-3",
      kind: "REFUND",
      parent_id: "pay-3",
      method: "QR",
      provider: "MERCADOPAGO_QR",
      amount: 2700,
      state: "PENDING",
      occurred_at: "2026-10-06T11:30:00.000Z",
    };
    const CASH_REFUND = {
      ...REFUND,
      id: "refund-1",
      parent_id: "pay-1",
      method: "CASH",
      provider: "NONE",
      state: "APPROVED",
    };

    it("accepts the QR payment with its pending refund, alone or beside a cash one", () => {
      expect(accepts("sale_cancelled", 6, cancelled())).toBe(true);
      expect(
        accepts("sale_cancelled", 6, {
          ...cancelled(),
          payments: [CASH_PAYMENT_V2, QR_PAYMENT],
          refunds: [CASH_REFUND, REFUND],
        }),
      ).toBe(true);
    });

    it("keeps accepting the standalone terminal sales of version 5 in version 6", () => {
      expect(accepts("sale_cancelled", 6, recordedPayload("sale_cancelled", 5, 1))).toBe(true);
    });

    it.each([
      ["an approved state", { state: "APPROVED" }],
      ["the none provider", { provider: "NONE" }],
      ["the Point provider", { provider: "MERCADOPAGO_POINT" }],
      ["a negative amount", { amount: -1 }],
    ])("refuses a QR refund with %s", (_description, change) => {
      expect(
        accepts("sale_cancelled", 6, {
          ...cancelled(),
          payments: [QR_PAYMENT],
          refunds: [{ ...REFUND, ...change }],
        }),
      ).toBe(false);
    });

    it("refuses a cash refund that is pending", () => {
      expect(
        accepts("sale_cancelled", 6, {
          ...cancelled(),
          refunds: [{ ...CASH_REFUND, state: "PENDING" }],
        }),
      ).toBe(false);
    });

    it("refuses a cancelled sale holding a Point payment", () => {
      expect(
        accepts("sale_cancelled", 6, {
          ...cancelled(),
          payments: [{ ...QR_PAYMENT, method: "POINT", provider: "MERCADOPAGO_POINT" }],
        }),
      ).toBe(false);
    });

    it.each([1, 2, 3, 4, 5])("keeps refusing the QR payment in version %s", (v) => {
      expect(
        accepts("sale_cancelled", v, {
          ...recordedPayload("sale_cancelled", v),
          payments: [QR_PAYMENT],
        }),
      ).toBe(false);
    });

    it.each([1, 2, 3, 4, 5])("keeps refusing the QR refund in version %s", (v) => {
      expect(
        accepts("sale_cancelled", v, {
          ...recordedPayload("sale_cancelled", v),
          refunds: [REFUND],
        }),
      ).toBe(false);
    });
  });

  describe("a sale cancelled after being paid on the Point terminal", () => {
    const cancelled = (): Payload => recordedPayload("sale_cancelled", 7);
    const POINT_PAYMENT = {
      ...CASH_PAYMENT_V2,
      id: "pay-4",
      method: "POINT",
      provider: "MERCADOPAGO_POINT",
      tendered: null,
    };
    const REFUND = {
      id: "refund-4",
      kind: "REFUND",
      parent_id: "pay-4",
      method: "POINT",
      provider: "MERCADOPAGO_POINT",
      amount: 2700,
      state: "PENDING",
      occurred_at: "2026-10-06T11:30:00.000Z",
    };
    const CASH_REFUND = {
      ...REFUND,
      id: "refund-1",
      parent_id: "pay-1",
      method: "CASH",
      provider: "NONE",
      state: "APPROVED",
    };

    it("accepts the Point payment with its pending refund, alone or beside a cash one", () => {
      expect(accepts("sale_cancelled", 7, cancelled())).toBe(true);
      expect(
        accepts("sale_cancelled", 7, {
          ...cancelled(),
          payments: [CASH_PAYMENT_V2, POINT_PAYMENT],
          refunds: [CASH_REFUND, REFUND],
        }),
      ).toBe(true);
    });

    it("keeps accepting the QR sales of version 6 in version 7", () => {
      expect(accepts("sale_cancelled", 7, recordedPayload("sale_cancelled", 6))).toBe(true);
    });

    it.each([
      ["an approved state", { state: "APPROVED" }],
      ["the none provider", { provider: "NONE" }],
      ["the QR provider", { provider: "MERCADOPAGO_QR" }],
      ["a negative amount", { amount: -1 }],
    ])("refuses a Point refund with %s", (_description, change) => {
      expect(
        accepts("sale_cancelled", 7, {
          ...cancelled(),
          payments: [POINT_PAYMENT],
          refunds: [{ ...REFUND, ...change }],
        }),
      ).toBe(false);
    });

    it.each([1, 2, 3, 4, 5, 6])("keeps refusing the Point payment in version %s", (v) => {
      expect(
        accepts("sale_cancelled", v, {
          ...recordedPayload("sale_cancelled", v),
          payments: [POINT_PAYMENT],
        }),
      ).toBe(false);
    });

    it.each([1, 2, 3, 4, 5, 6])("keeps refusing the Point refund in version %s", (v) => {
      expect(
        accepts("sale_cancelled", v, {
          ...recordedPayload("sale_cancelled", v),
          refunds: [REFUND],
        }),
      ).toBe(false);
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

  describe("a sale recording its discount on the total", () => {
    const DISCOUNT = {
      kind: "PERCENT",
      value: 10,
      amount: 450,
      reason: "Compra grande",
      authorized_by: null,
    };
    const withoutDiscount = (sale: Payload): Payload => ({
      ...sale,
      sale_discount: null,
      lines: (sale["lines"] as Payload[]).map((line) => ({ ...line, sale_discount_share: 0 })),
    });
    const completed = (): Payload => withoutDiscount(recordedPayload("sale_completed", 7));
    const cancelled = (): Payload => withoutDiscount(recordedPayload("sale_cancelled", 3));
    const discounted = (sale: Payload, change: Payload = {}): Payload => ({
      ...sale,
      sale_discount: { ...DISCOUNT, ...change },
    });

    it.each([
      ["sale_completed", 8, completed],
      ["sale_cancelled", 4, cancelled],
    ])("accepts a %s v%i with no discount on the total", (eventType, version, sale) => {
      expect(accepts(eventType, version, sale())).toBe(true);
    });

    it.each([
      ["a percent", {}],
      ["a percent of one hundred", { value: 100 }],
      ["an amount", { kind: "AMOUNT", value: 450 }],
      ["an authorizer", { authorized_by: "user-2" }],
      ["a discount of zero cents", { amount: 0 }],
    ])("accepts a discount on the total with %s", (_case, change) => {
      expect(accepts("sale_completed", 8, discounted(completed(), change))).toBe(true);
      expect(accepts("sale_cancelled", 4, discounted(cancelled(), change))).toBe(true);
    });

    it.each([
      ["a kind nobody records", { kind: "PRICE" }],
      ["a lowercase kind", { kind: "percent" }],
      ["a percent of zero", { value: 0 }],
      ["a percent over one hundred", { value: 101 }],
      ["a fractional percent", { value: 10.5 }],
      ["an amount of zero", { kind: "AMOUNT", value: 0 }],
      ["a negative amount", { kind: "AMOUNT", value: -1 }],
      ["a negative discounted amount", { amount: -1 }],
      ["a fractional discounted amount", { amount: 4.5 }],
      ["an empty reason", { reason: "" }],
      ["a reason with surrounding spaces", { reason: " Compra grande " }],
      ["an empty authorizer", { authorized_by: "" }],
    ])("refuses a discount on the total with %s", (_case, change) => {
      expect(accepts("sale_completed", 8, discounted(completed(), change))).toBe(false);
      expect(accepts("sale_cancelled", 4, discounted(cancelled(), change))).toBe(false);
    });

    it.each(["kind", "value", "amount", "reason", "authorized_by"])(
      "refuses a discount on the total without its %s",
      (field) => {
        const { [field]: _removed, ...discount } = DISCOUNT as Payload;

        expect(accepts("sale_completed", 8, { ...completed(), sale_discount: discount })).toBe(
          false,
        );
        expect(accepts("sale_cancelled", 4, { ...cancelled(), sale_discount: discount })).toBe(
          false,
        );
      },
    );

    it.each([
      ["sale_completed", 8, completed],
      ["sale_cancelled", 4, cancelled],
    ])("refuses a %s v%i without the discount field", (eventType, version, sale) => {
      const { sale_discount: _removed, ...rest } = sale();

      expect(accepts(eventType, version, rest)).toBe(false);
    });

    it.each([
      ["sale_completed", 8, completed],
      ["sale_cancelled", 4, cancelled],
    ])("refuses a %s v%i whose line has no share of the discount", (eventType, version, sale) => {
      const body = sale();
      const [line, ...others] = body["lines"] as Payload[];
      const { sale_discount_share: _removed, ...bare } = line as Payload;

      expect(accepts(eventType, version, { ...body, lines: [bare, ...others] })).toBe(false);
    });

    it.each([
      ["a negative share", -1],
      ["a fractional share", 0.5],
    ])("refuses a line with %s", (_case, share) => {
      const sale = completed();
      const [line, ...others] = sale["lines"] as Payload[];

      expect(
        accepts("sale_completed", 8, {
          ...sale,
          lines: [{ ...line, sale_discount_share: share }, ...others],
        }),
      ).toBe(false);
    });

    it("accepts a line whose share is a positive number of cents", () => {
      const sale = completed();
      const [line, ...others] = sale["lines"] as Payload[];

      expect(
        accepts("sale_completed", 8, {
          ...sale,
          lines: [{ ...line, sale_discount_share: 450 }, ...others],
        }),
      ).toBe(true);
    });

    it.each([
      ["sale_completed", 7],
      ["sale_cancelled", 3],
    ])("keeps reading a %s v%i, which carries no discount on the total", (eventType, version) => {
      expect(accepts(eventType, version, recordedPayload(eventType, version))).toBe(true);
    });
  });

  describe("a sale's lines recording their manual adjustment", () => {
    const ADJUSTED_LINE = {
      id: "line-3",
      product_id: "yerba",
      product_name: "Yerba 1 kg",
      weight_source: null,
      quantity: 2,
      list_unit_price: 2500,
      price_list_id: "list-1",
      promotion_id: null,
      discount_amount: 500,
      promotions: [],
      line_total: 4500,
      manual_adjustment: {
        kind: "PERCENT",
        value: 10,
        reason: "Cliente frecuente",
        authorized_by: null,
      },
    };
    const unadjusted = (line: Payload): Payload => ({ ...line, manual_adjustment: null });
    const completed = (): Payload => {
      const sale = recordedPayload("sale_completed", 6);
      return { ...sale, lines: (sale["lines"] as Payload[]).map(unadjusted) };
    };
    const cancelled = (): Payload => {
      const sale = structuredClone(CANCELLED_SALE_V1);
      return {
        ...sale,
        lines: (sale["lines"] as Payload[]).map((line) =>
          unadjusted({ ...line, weight_source: null }),
        ),
      };
    };
    const withLines = (sale: Payload, lines: Payload[]): Payload => ({
      ...sale,
      lines: [...(sale["lines"] as Payload[]), ...lines],
    });
    const adjustedWith = (change: Payload): Payload => ({
      ...ADJUSTED_LINE,
      manual_adjustment: { ...ADJUSTED_LINE.manual_adjustment, ...change },
    });

    it.each([
      ["sale_completed", 7, completed],
      ["sale_cancelled", 3, cancelled],
    ])("accepts a %s v%i whose lines have no manual adjustment", (eventType, version, sale) => {
      expect(accepts(eventType, version, sale())).toBe(true);
    });

    it.each([
      ["a price", { kind: "PRICE", value: 2000 }],
      ["a price of zero", { kind: "PRICE", value: 0 }],
      ["a percent", { kind: "PERCENT", value: 100 }],
      ["an amount", { kind: "AMOUNT", value: 300 }],
      ["an authorizer", { authorized_by: "user-2" }],
    ])("accepts a line adjusted with %s", (_case, change) => {
      const line = adjustedWith(change);

      expect(accepts("sale_completed", 7, withLines(completed(), [line]))).toBe(true);
      expect(accepts("sale_cancelled", 3, withLines(cancelled(), [line]))).toBe(true);
    });

    it.each([
      ["a kind nobody records", { kind: "BONUS" }],
      ["a lowercase kind", { kind: "percent" }],
      ["a percent of zero", { kind: "PERCENT", value: 0 }],
      ["a percent over one hundred", { kind: "PERCENT", value: 101 }],
      ["a fractional percent", { kind: "PERCENT", value: 10.5 }],
      ["an amount of zero", { kind: "AMOUNT", value: 0 }],
      ["a negative amount", { kind: "AMOUNT", value: -300 }],
      ["a negative price", { kind: "PRICE", value: -1 }],
      ["a fractional price", { kind: "PRICE", value: 20.5 }],
      ["a price above the maximum", { kind: "PRICE", value: MAX_UNIT_PRICE_CENTS + 1 }],
      ["an empty reason", { reason: "" }],
      ["a reason with surrounding spaces", { reason: " Cliente frecuente " }],
      ["an empty authorizer", { authorized_by: "" }],
    ])("refuses a line adjusted with %s", (_case, change) => {
      const line = adjustedWith(change);

      expect(accepts("sale_completed", 7, withLines(completed(), [line]))).toBe(false);
      expect(accepts("sale_cancelled", 3, withLines(cancelled(), [line]))).toBe(false);
    });

    it.each(["kind", "value", "reason", "authorized_by"])(
      "refuses an adjustment without its %s",
      (field) => {
        const { [field]: _removed, ...adjustment } = ADJUSTED_LINE.manual_adjustment as Payload;
        const line = { ...ADJUSTED_LINE, manual_adjustment: adjustment };

        expect(accepts("sale_completed", 7, withLines(completed(), [line]))).toBe(false);
        expect(accepts("sale_cancelled", 3, withLines(cancelled(), [line]))).toBe(false);
      },
    );

    it("refuses a line without the field", () => {
      const { manual_adjustment: _removed, ...line } = ADJUSTED_LINE;

      expect(accepts("sale_completed", 7, withLines(completed(), [line]))).toBe(false);
      expect(accepts("sale_cancelled", 3, withLines(cancelled(), [line]))).toBe(false);
    });

    it.each([
      ["sale_completed", 6],
      ["sale_cancelled", 2],
    ])("keeps reading a %s v%i, whose lines carry no manual adjustment", (eventType, version) => {
      const sale =
        eventType === "sale_completed"
          ? recordedPayload("sale_completed", 6)
          : {
              ...structuredClone(CANCELLED_SALE_V1),
              lines: (CANCELLED_SALE_V1["lines"] as Payload[]).map((line) => ({
                ...line,
                weight_source: null,
              })),
            };

      expect(accepts(eventType, version, sale)).toBe(true);
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

const VOIDED_SALE_V1: Payload = {
  id: "sale-1",
  register_id: "register-1",
  device_id: "device-1",
  session_id: "session-1",
  actor_id: "cashier",
  authorized_by: null,
  occurred_at: "2026-10-07T15:30:00.000Z",
  total: 6750,
  sale_discount: null,
  lines: [
    {
      id: "line-1",
      product_id: "yerba",
      product_name: "Yerba 1 kg",
      weight_source: null,
      manual_adjustment: null,
      quantity: 3,
      list_unit_price: 2500,
      price_list_id: "list-1",
      promotion_id: "ten",
      discount_amount: 750,
      promotions: [
        { discount_id: "ten", kind: "PERCENT_OFF", percent: 10, buy_qty: null, pay_qty: null },
      ],
      sale_discount_share: 0,
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
  stock_movements: [{ id: "stock-2", sale_line_id: "line-1", product_id: "yerba", delta: 3000 }],
  deferred_record_cancelled: true,
};

describe("sale_voided v1", () => {
  const voided = (): Payload => structuredClone(VOIDED_SALE_V1);
  const TRANSFER_PAYMENT = {
    id: "pay-2",
    kind: "SALE",
    method: "TRANSFER",
    provider: "NONE",
    amount: 2000,
    tendered: null,
    state: "APPROVED",
    occurred_at: "2026-10-07T15:10:00.000Z",
    authorized_by: "cashier",
    confirmed_at: "2026-10-07T15:10:00.000Z",
  };
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
  const TERMINAL_PAYMENT = {
    ...TRANSFER_PAYMENT,
    id: "pay-3",
    method: "STANDALONE_TERMINAL",
    provider: "EXTERNAL_TERMINAL",
  };
  const TERMINAL_REFUND = {
    ...TRANSFER_REFUND,
    id: "refund-3",
    parent_id: "pay-3",
    method: "STANDALONE_TERMINAL",
    provider: "EXTERNAL_TERMINAL",
  };

  it("keeps its schema at its first version", () => {
    expect(syncedEventPayloadKey("sale_voided", 1)).toBe("sale_voided@1");
    expect(syncedEventPayloadKey("sale_voided", 0)).toBeUndefined();
  });

  it("is described by a payload with the sale, its payments, refunds, cash movements and returned stock", () => {
    expect(accepts("sale_voided", 1, voided())).toBe(true);
  });

  it("accepts a sale voided with another person's authorization", () => {
    expect(accepts("sale_voided", 1, { ...voided(), authorized_by: "supervisor" })).toBe(true);
  });

  it("accepts a sale that cancelled no deferred record", () => {
    expect(accepts("sale_voided", 1, { ...voided(), deferred_record_cancelled: false })).toBe(true);
  });

  it("accepts the pending refunds of a transfer and of the standalone terminal", () => {
    expect(
      accepts("sale_voided", 1, {
        ...voided(),
        payments: [TRANSFER_PAYMENT, TERMINAL_PAYMENT],
        refunds: [TRANSFER_REFUND, TERMINAL_REFUND],
      }),
    ).toBe(true);
  });

  it("accepts a sale with a discount on its total", () => {
    expect(
      accepts("sale_voided", 1, {
        ...voided(),
        sale_discount: {
          kind: "PERCENT",
          value: 10,
          amount: 675,
          reason: "Rotura",
          authorized_by: null,
        },
      }),
    ).toBe(true);
  });

  it("refuses a payload without any one of its fields", () => {
    const payload = voided();

    const accepted = Object.keys(payload).filter((key) => {
      const { [key]: _removed, ...rest } = payload;
      return accepts("sale_voided", 1, rest);
    });

    expect(accepted).toEqual([]);
  });

  it("refuses a payload with any one of its fields of the wrong type", () => {
    const payload = voided();

    const accepted = Object.keys(payload).filter((key) =>
      accepts("sale_voided", 1, { ...payload, [key]: { unexpected: true } }),
    );

    expect(accepted).toEqual([]);
  });

  it("refuses a payload that is not an object", () => {
    expect(accepts("sale_voided", 1, null)).toBe(false);
    expect(accepts("sale_voided", 1, [])).toBe(false);
  });

  it("refuses a sale with no payment or no refund", () => {
    expect(accepts("sale_voided", 1, { ...voided(), payments: [] })).toBe(false);
    expect(accepts("sale_voided", 1, { ...voided(), refunds: [] })).toBe(false);
  });

  it.each([
    ["Mercado Pago QR", "QR", "MERCADOPAGO_QR"],
    ["Mercado Pago Point", "POINT", "MERCADOPAGO_POINT"],
  ])("refuses a sale paid through %s, which is not voided yet", (_name, method, provider) => {
    const payment = { ...TRANSFER_PAYMENT, method, provider };
    const refund = { ...TRANSFER_REFUND, method, provider };

    expect(accepts("sale_voided", 1, { ...voided(), payments: [payment], refunds: [refund] })).toBe(
      false,
    );
  });

  it("refuses a cash refund that is pending and a transfer refund that is already done", () => {
    const cash = (voided()["refunds"] as Payload[])[0] as Payload;

    expect(
      accepts("sale_voided", 1, { ...voided(), refunds: [{ ...cash, state: "PENDING" }] }),
    ).toBe(false);
    expect(
      accepts("sale_voided", 1, {
        ...voided(),
        payments: [TRANSFER_PAYMENT],
        refunds: [{ ...TRANSFER_REFUND, state: "APPROVED" }],
      }),
    ).toBe(false);
  });

  it.each([
    ["a negative delta, which would take stock out", -3000],
    ["a zero delta", 0],
    ["a fractional delta", 1.5],
    ["a delta over the stock limit", 2_147_483_648],
  ])("refuses a returned stock movement with %s", (_case, delta) => {
    expect(
      accepts("sale_voided", 1, {
        ...voided(),
        stock_movements: [{ id: "stock-2", sale_line_id: "line-1", product_id: "yerba", delta }],
      }),
    ).toBe(false);
  });

  it("accepts the highest stock a movement may return", () => {
    expect(
      accepts("sale_voided", 1, {
        ...voided(),
        stock_movements: [
          { id: "stock-2", sale_line_id: "line-1", product_id: "yerba", delta: 2_147_483_647 },
        ],
      }),
    ).toBe(true);
  });

  it("refuses a deferred record flag that is not a boolean", () => {
    expect(accepts("sale_voided", 1, { ...voided(), deferred_record_cancelled: "yes" })).toBe(
      false,
    );
  });

  it("refuses a total that is negative or fractional", () => {
    expect(accepts("sale_voided", 1, { ...voided(), total: -1 })).toBe(false);
    expect(accepts("sale_voided", 1, { ...voided(), total: 10.5 })).toBe(false);
  });

  it("refuses a date that is not ISO", () => {
    expect(accepts("sale_voided", 1, { ...voided(), occurred_at: "later" })).toBe(false);
  });

  it("refuses an authorizer that is not text", () => {
    expect(accepts("sale_voided", 1, { ...voided(), authorized_by: 7 })).toBe(false);
  });

  it("refuses a line with a quantity of zero", () => {
    const line = (voided()["lines"] as Payload[])[0] as Payload;

    expect(accepts("sale_voided", 1, { ...voided(), lines: [{ ...line, quantity: 0 }] })).toBe(
      false,
    );
  });

  it("refuses a cash movement of a type no sale records", () => {
    const [sale] = voided()["cash_movements"] as Payload[];

    expect(
      accepts("sale_voided", 1, { ...voided(), cash_movements: [{ ...sale, type: "TIP" }] }),
    ).toBe(false);
  });
});

describe("sale_voided v2", () => {
  const voided = (): Payload => structuredClone(VOIDED_SALE_V1);
  const QR_PAYMENT = {
    id: "pay-2",
    kind: "SALE",
    method: "QR",
    provider: "MERCADOPAGO_QR",
    amount: 2000,
    tendered: null,
    state: "APPROVED",
    occurred_at: "2026-10-07T15:10:00.000Z",
    authorized_by: null,
    confirmed_at: null,
  };
  const QR_REFUND = {
    id: "refund-2",
    kind: "REFUND",
    parent_id: "pay-2",
    method: "QR",
    provider: "MERCADOPAGO_QR",
    amount: 2000,
    state: "PENDING",
    occurred_at: "2026-10-07T15:30:00.000Z",
  };
  const POINT_PAYMENT = {
    ...QR_PAYMENT,
    id: "pay-3",
    method: "POINT",
    provider: "MERCADOPAGO_POINT",
  };
  const POINT_REFUND = {
    ...QR_REFUND,
    id: "refund-3",
    parent_id: "pay-3",
    method: "POINT",
    provider: "MERCADOPAGO_POINT",
  };

  it("has a schema at its second version", () => {
    expect(syncedEventPayloadKey("sale_voided", 2)).toBe("sale_voided@2");
  });

  it("accepts a sale paid in cash, as the first version does", () => {
    expect(accepts("sale_voided", 2, voided())).toBe(true);
  });

  it("describes a sale paid in cash and through Mercado Pago QR and Point, with their pending refunds", () => {
    const [cashPayment] = voided()["payments"] as Payload[];
    const [cashRefund] = voided()["refunds"] as Payload[];

    expect(
      accepts("sale_voided", 2, {
        ...voided(),
        payments: [cashPayment, QR_PAYMENT, POINT_PAYMENT],
        refunds: [cashRefund, QR_REFUND, POINT_REFUND],
      }),
    ).toBe(true);
  });

  it("still refuses a Mercado Pago refund that is already done", () => {
    expect(
      accepts("sale_voided", 2, {
        ...voided(),
        payments: [QR_PAYMENT],
        refunds: [{ ...QR_REFUND, state: "APPROVED" }],
      }),
    ).toBe(false);
  });

  it.each([
    ["a QR refund of Point's provider", { ...QR_REFUND, provider: "MERCADOPAGO_POINT" }],
    ["a Point refund of QR's provider", { ...POINT_REFUND, provider: "MERCADOPAGO_QR" }],
    ["a Point refund with no provider", { ...POINT_REFUND, provider: "NONE" }],
  ])("refuses %s", (_case, refund) => {
    expect(accepts("sale_voided", 2, { ...voided(), refunds: [refund] })).toBe(false);
  });

  it("refuses a Point payment of QR's provider", () => {
    const payment = { ...POINT_PAYMENT, provider: "MERCADOPAGO_QR" };

    expect(
      accepts("sale_voided", 2, { ...voided(), payments: [payment], refunds: [POINT_REFUND] }),
    ).toBe(false);
  });

  it("refuses the payload without any one of its fields", () => {
    const payload = voided();

    const accepted = Object.keys(payload).filter((key) => {
      const { [key]: _removed, ...rest } = payload;
      return accepts("sale_voided", 2, rest);
    });

    expect(accepted).toEqual([]);
  });

  it("refuses a voided sale without payments or without refunds", () => {
    expect(accepts("sale_voided", 2, { ...voided(), payments: [] })).toBe(false);
    expect(accepts("sale_voided", 2, { ...voided(), refunds: [] })).toBe(false);
  });
});

describe("sale_voided v3", () => {
  const CREDIT_NOTE = {
    id: "credit-note-1",
    total: 6750,
    receiver_tax_status_code: 5,
    corrects: { voucher_type: 11, point_of_sale: 3, number: 1204 },
  };
  const voided = (creditNote: unknown = null): Payload => ({
    ...structuredClone(VOIDED_SALE_V1),
    credit_note: creditNote,
  });

  it("has a schema at its third version", () => {
    expect(syncedEventPayloadKey("sale_voided", 3)).toBe("sale_voided@3");
  });

  it("describes a void that asks for no credit note", () => {
    expect(accepts("sale_voided", 3, voided())).toBe(true);
  });

  it("describes the credit note of a voided sale that carried an invoice", () => {
    expect(accepts("sale_voided", 3, voided(CREDIT_NOTE))).toBe(true);
  });

  it("keeps the previous versions' payloads for v1 and v2, which carry no credit note", () => {
    expect(accepts("sale_voided", 1, structuredClone(VOIDED_SALE_V1))).toBe(true);
    expect(accepts("sale_voided", 2, structuredClone(VOIDED_SALE_V1))).toBe(true);
  });

  it("describes a sale paid through Mercado Pago, as the second version does", () => {
    const [cashPayment] = voided()["payments"] as Payload[];
    const [cashRefund] = voided()["refunds"] as Payload[];
    const payment = {
      ...cashPayment,
      id: "pay-2",
      method: "QR",
      provider: "MERCADOPAGO_QR",
      tendered: null,
      authorized_by: null,
      confirmed_at: null,
    };
    const refund = {
      ...cashRefund,
      id: "refund-2",
      parent_id: "pay-2",
      method: "QR",
      provider: "MERCADOPAGO_QR",
      state: "PENDING",
    };

    expect(accepts("sale_voided", 3, { ...voided(), payments: [payment], refunds: [refund] })).toBe(
      true,
    );
  });

  it("refuses the payload without any one of its fields", () => {
    const payload = voided(CREDIT_NOTE);

    const accepted = Object.keys(payload).filter((key) => {
      const { [key]: _removed, ...rest } = payload;
      return accepts("sale_voided", 3, rest);
    });

    expect(accepted).toEqual([]);
  });

  it("refuses a credit note without any one of its fields", () => {
    const accepted = Object.keys(CREDIT_NOTE).filter((key) => {
      const { [key]: _removed, ...rest } = structuredClone(CREDIT_NOTE) as Payload;
      return accepts("sale_voided", 3, voided(rest));
    });

    expect(accepted).toEqual([]);
  });

  it.each([
    ["a credit note without an id", { ...CREDIT_NOTE, id: "" }],
    ["a credit note of nothing", { ...CREDIT_NOTE, total: 0 }],
    ["a negative total", { ...CREDIT_NOTE, total: -1 }],
    ["a fractional total", { ...CREDIT_NOTE, total: 10.5 }],
    ["a receiver status that is not an integer", { ...CREDIT_NOTE, receiver_tax_status_code: 5.5 }],
    [
      "a corrected voucher without a number",
      { ...CREDIT_NOTE, corrects: { ...CREDIT_NOTE.corrects, number: 0 } },
    ],
    [
      "a corrected voucher without a point of sale",
      { ...CREDIT_NOTE, corrects: { ...CREDIT_NOTE.corrects, point_of_sale: 0 } },
    ],
    [
      "a corrected voucher of another kind than a factura C",
      { ...CREDIT_NOTE, corrects: { ...CREDIT_NOTE.corrects, voucher_type: 13 } },
    ],
    ["no corrected voucher", { ...CREDIT_NOTE, corrects: null }],
  ])("refuses %s", (_case, creditNote) => {
    expect(accepts("sale_voided", 3, voided(creditNote))).toBe(false);
  });

  it("refuses a credit note that is not an object", () => {
    expect(accepts("sale_voided", 3, voided("credit-note-1"))).toBe(false);
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
    expect(syncedEventPayloadKey("sale_cancelled", 8)).toBeUndefined();
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

describe("the initial count's payloads", () => {
  const MOVEMENT_ID = "0d7b6f3e-5b1c-4c6e-9a51-3f1f6c1a2b01";
  const OTHER_MOVEMENT_ID = "6f9c2a54-83de-4f0a-8d77-0b5a9e4c7d12";
  const PRODUCT_ID = "a1b2c3d4-e5f6-4a8b-9c0d-1e2f3a4b5c6d";
  const RECORDED = {
    movement_id: MOVEMENT_ID,
    product_id: PRODUCT_ID,
    counted: 6_000,
    expires_on: "2027-01-31",
  };
  const WITHDRAWN = { movement_id: OTHER_MOVEMENT_ID, withdrawn_movement_id: MOVEMENT_ID };

  it("has a schema for each version 1 and none beyond", () => {
    expect(syncedEventPayloadKey("opening_count_recorded", 1)).toBe("opening_count_recorded@1");
    expect(syncedEventPayloadKey("opening_count_withdrawn", 1)).toBe("opening_count_withdrawn@1");
    expect(syncedEventPayloadKey("opening_count_recorded", 2)).toBeUndefined();
    expect(syncedEventPayloadKey("opening_count_withdrawn", 2)).toBeUndefined();
  });

  it("accepts a counted line with an expiry and one without", () => {
    expect(accepts("opening_count_recorded", 1, RECORDED)).toBe(true);
    expect(accepts("opening_count_recorded", 1, { ...RECORDED, expires_on: null })).toBe(true);
  });

  it("accepts the largest quantity", () => {
    expect(accepts("opening_count_recorded", 1, { ...RECORDED, counted: MAX_STOCK_QUANTITY })).toBe(
      true,
    );
  });

  it.each([
    ["zero", 0],
    ["negative", -1_000],
    ["fractional", 1.5],
    ["above the largest quantity", MAX_STOCK_QUANTITY + 1],
    ["not a number", "6000"],
  ])("refuses a counted quantity that is %s", (_case, counted) => {
    expect(accepts("opening_count_recorded", 1, { ...RECORDED, counted })).toBe(false);
  });

  it.each([
    ["not a day", "2027-02-30"],
    ["not a date", "soon"],
    ["an instant", "2027-01-31T00:00:00.000Z"],
    ["missing", undefined],
  ])("refuses an expiry that is %s", (_case, expires_on) => {
    expect(accepts("opening_count_recorded", 1, { ...RECORDED, expires_on })).toBe(false);
  });

  it.each(["movement_id", "product_id"])("refuses a counted line whose %s is no uuid", (field) => {
    expect(accepts("opening_count_recorded", 1, { ...RECORDED, [field]: "movement-1" })).toBe(
      false,
    );
  });

  it("refuses a counted line without any one of its fields", () => {
    const accepted = Object.keys(RECORDED).filter((key) => {
      const { [key]: _removed, ...rest } = RECORDED as Payload;
      return accepts("opening_count_recorded", 1, rest);
    });

    expect(accepted).toEqual([]);
  });

  it("accepts a withdrawal of a line", () => {
    expect(accepts("opening_count_withdrawn", 1, WITHDRAWN)).toBe(true);
  });

  it("takes as an id any record id, not only one of a uuid version", () => {
    const RECORD_ID = "0d7b6f3e-5b1c-0c6e-0a51-3f1f6c1a2b01";

    expect(
      accepts("opening_count_recorded", 1, {
        ...RECORDED,
        movement_id: RECORD_ID,
        product_id: RECORD_ID,
      }),
    ).toBe(true);
    expect(
      accepts("opening_count_withdrawn", 1, {
        movement_id: RECORD_ID,
        withdrawn_movement_id: RECORD_ID,
      }),
    ).toBe(true);
  });

  it.each(["movement_id", "withdrawn_movement_id"])(
    "refuses a withdrawal whose %s is no uuid or is missing",
    (field) => {
      expect(accepts("opening_count_withdrawn", 1, { ...WITHDRAWN, [field]: "movement-1" })).toBe(
        false,
      );
      const { [field]: _removed, ...rest } = WITHDRAWN as Payload;
      expect(accepts("opening_count_withdrawn", 1, rest)).toBe(false);
    },
  );
});

describe("the readable event versions", () => {
  it("lists each version once", () => {
    expect(new Set(READABLE_EVENT_VERSIONS).size).toBe(READABLE_EVENT_VERSIONS.length);
  });

  it("lists every version the decoder knows, and only those", () => {
    const listed = READABLE_EVENT_VERSIONS.map((version) => {
      const [eventType = "", schemaVersion = ""] = version.split("@");
      return { eventType, schemaVersion: Number(schemaVersion) };
    });
    const eventTypes = new Set(listed.map(({ eventType }) => eventType));
    const highest = Math.max(...listed.map(({ schemaVersion }) => schemaVersion));

    const decoded: string[] = [];
    for (const eventType of [...eventTypes, "unknown_event"]) {
      for (let schemaVersion = 0; schemaVersion <= highest + 1; schemaVersion += 1) {
        if (syncedEventPayloadKey(eventType, schemaVersion) !== undefined) {
          decoded.push([eventType, schemaVersion].join("@"));
        }
      }
    }

    expect(decoded).not.toEqual([]);
    expect(decoded.sort()).toEqual([...READABLE_EVENT_VERSIONS].sort());
  });

  it("lists the version of every recorded event", () => {
    const recorded = new Set(
      recordedEvents().map((event) => [event.event_type, event.schema_version].join("@")),
    );

    expect(recorded.size).toBeGreaterThan(0);
    expect(READABLE_EVENT_VERSIONS).toEqual(expect.arrayContaining([...recorded]));
  });
});

import { describe, expect, it } from "vitest";
import type { PushedEvent } from "../../sync/index.js";
import type { InvoicedCreditNote } from "../model/sale-credit-note.js";
import {
  type AcceptSaleCreditNoteRequestInput,
  acceptSaleCreditNoteRequest,
} from "./accept-sale-credit-note-request.js";
import { VoucherAlreadyCredited } from "./accept-sale-credit-note-request-ports.js";
import type { CreditNote, CreditNoteStanding } from "./credit-note-ports.js";
import { FakeAttachedSaleEvents } from "./test-support/fake-attached-sale-events.js";
import {
  type FakeRegisterPointsOfSale,
  FakeSaleCreditNoteStore,
} from "./test-support/fake-sale-credit-notes.js";

const RECEIVED_AT = new Date("2026-10-07T15:31:00.000Z");
const REGISTER_ID = "register-1";
const DEVICE_ID = "device-1";
const CREDIT_NOTE_ID = "credit-note-1";

const VOIDED: InvoicedCreditNote = {
  creditNoteId: CREDIT_NOTE_ID,
  saleId: "sale-1",
  total: 7_500,
  receiverTaxStatusCode: 5,
  correctedVoucher: { voucherType: 11, pointOfSale: 8, number: 77 },
  origin: { kind: "sale_void" },
};

const RETURNED: InvoicedCreditNote = {
  ...VOIDED,
  total: 3_000,
  origin: { kind: "sale_return", returnId: "return-1", issuedOn: "2026-10-06" },
};

const SALE_EVENT: PushedEvent = {
  event_id: "event-1",
  device_seq: 4,
  aggregate_type: "sale",
  aggregate_id: "sale-1",
  event_type: "sale_voided",
  schema_version: 3,
  payload: {},
  occurred_at: "2026-10-07T15:30:00.000Z",
  actor_id: "user-1",
  chain_hmac: "hmac",
};

const REQUEST = {
  creditNoteId: CREDIT_NOTE_ID,
  pointOfSale: 12,
  creditNote: VOIDED,
  saleEvent: SALE_EVENT,
};

const STORED: CreditNote = {
  creditNoteId: CREDIT_NOTE_ID,
  pointOfSale: 12,
  associatedVoucher: { voucherType: 11, pointOfSale: 8, number: 77 },
  total: 7_500,
  receiverTaxStatusCode: 5,
  reason: "sale_void",
  issueOn: null,
  standing: { kind: "not_requested" },
};

const VOUCHER = { voucherType: 11, pointOfSale: 8, number: 77 };

interface Scenario {
  invoices?: [typeof VOUCHER, number][];
  registers?: [string, FakeRegisterPointsOfSale][];
  seeded?: [string, CreditNote][];
  request?: Partial<AcceptSaleCreditNoteRequestInput["request"]>;
  registerId?: string;
  attachedFailure?: Error;
}

function request({
  invoices = [[VOUCHER, 7_500]],
  registers = [[REGISTER_ID, { realTime: 12, offline: 8 }]],
  seeded = [],
  request: overrides = {},
  registerId = REGISTER_ID,
  attachedFailure,
}: Scenario = {}) {
  const store = new FakeSaleCreditNoteStore(registers, invoices);
  const attachedSaleEvents = new FakeAttachedSaleEvents(store);
  attachedSaleEvents.failure = attachedFailure;
  for (const [owner, creditNote] of seeded) {
    store.seed(owner, creditNote);
  }
  return {
    store,
    attachedSaleEvents,
    run: () =>
      acceptSaleCreditNoteRequest(
        { lanes: store, attachedSaleEvents },
        {
          deviceId: DEVICE_ID,
          registerId,
          request: { ...REQUEST, ...overrides },
          receivedAt: RECEIVED_AT,
        },
      ),
  };
}

describe("acceptSaleCreditNoteRequest", () => {
  describe("the first request of a credit note", () => {
    it("records the credit note the void's event asks for, in the register's real-time point of sale", async () => {
      const { store, run } = request();

      expect(await run()).toEqual({ kind: "recorded" });
      expect(store.records).toEqual([
        {
          creditNoteId: CREDIT_NOTE_ID,
          registerId: REGISTER_ID,
          saleId: "sale-1",
          pointOfSale: 12,
          correctedVoucher: { voucherType: 11, pointOfSale: 8, number: 77 },
          total: 7_500,
          receiverTaxStatusCode: 5,
          origin: { kind: "sale_void" },
          receivedAt: RECEIVED_AT,
        },
      ]);
      expect(store.recorded.get(CREDIT_NOTE_ID)).toEqual({
        registerId: REGISTER_ID,
        creditNote: STORED,
      });
    });

    it("takes the lane of the credit note's point of sale once, and records inside it", async () => {
      const { store, run } = request();

      await run();

      expect(store.lanesEntered).toEqual([12]);
      expect(store.operations).toEqual([
        "recordAttachedSaleEvent",
        "enterLane",
        "registerOwnsPointOfSale",
        "recordedCreditNote",
        "registerIssuesFromPointOfSale",
        "invoiceTotalOf",
        "creditedToInvoice",
        "recordSaleCreditNote",
        "leaveLane",
      ]);
    });

    it("looks the credit note up among the register's own", async () => {
      const { store, run } = request();

      await run();

      expect(store.lookups).toEqual([{ registerId: REGISTER_ID, creditNoteId: CREDIT_NOTE_ID }]);
    });

    it("credits an invoice of the real-time point of sale as well as one of the contingency point of sale", async () => {
      const { store, run } = request({
        request: {
          creditNote: {
            ...VOIDED,
            correctedVoucher: { voucherType: 11, pointOfSale: 12, number: 1204 },
          },
        },
      });

      expect(await run()).toEqual({ kind: "recorded" });
      expect(store.records[0]?.correctedVoucher).toEqual({
        voucherType: 11,
        pointOfSale: 12,
        number: 1204,
      });
    });
  });

  describe("a credit note requested again", () => {
    it.each<[string, CreditNoteStanding, object]>([
      ["not issued yet", { kind: "not_requested" }, { kind: "in_progress" }],
      [
        "asked to the tax authority",
        {
          kind: "requested",
          number: 42,
          issuedOn: "2026-10-07",
          requestedAt: RECEIVED_AT,
          unclearAnsweredAt: null,
        },
        { kind: "in_progress" },
      ],
      ["rejected", { kind: "rejected" }, { kind: "rejected" }],
      [
        "impossible to issue",
        { kind: "regularization_required" },
        { kind: "regularization_required" },
      ],
      [
        "authorized",
        {
          kind: "authorized",
          number: 42,
          issuedOn: "2026-10-07",
          requestedAt: RECEIVED_AT,
          authorizationCode: "75123456789099",
          authorizationCodeDueOn: "2026-10-17",
        },
        {
          kind: "authorized",
          pointOfSale: 12,
          number: 42,
          issuedOn: "2026-10-07",
          issuedAt: RECEIVED_AT,
          authorizationCode: "75123456789099",
          authorizationCodeDueOn: "2026-10-17",
        },
      ],
    ])(
      "answers the state of a credit note %s, recording no credit note",
      async (_case, standing, answer) => {
        const { store, run } = request({
          seeded: [[REGISTER_ID, { ...STORED, standing }]],
        });

        expect(await run()).toEqual({ kind: "already_recorded", answer });
        expect(store.records).toEqual([]);
      },
    );

    it("does not record the same credit note twice when asked twice", async () => {
      const { store, run } = request();

      await run();
      const second = await run();

      expect(second).toEqual({ kind: "already_recorded", answer: { kind: "in_progress" } });
      expect(store.records).toHaveLength(1);
    });

    it("refuses a credit note id that another register recorded, leaving it as it was", async () => {
      const theirs: CreditNote = {
        ...STORED,
        pointOfSale: 13,
        associatedVoucher: { voucherType: 11, pointOfSale: 13, number: 5 },
      };
      const { store, run } = request({
        registers: [
          [REGISTER_ID, { realTime: 12, offline: 8 }],
          ["register-2", { realTime: 13 }],
        ],
        seeded: [["register-2", theirs]],
      });

      expect(await run()).toEqual({ kind: "credit_note_not_owned" });
      expect(store.records).toEqual([]);
      expect(store.recorded.get(CREDIT_NOTE_ID)).toEqual({
        registerId: "register-2",
        creditNote: theirs,
      });
    });
  });

  it("lets a failure of the storage through, recording no credit note", async () => {
    const { store, run } = request();
    store.recordFailure = new Error("the storage is down");

    await expect(run()).rejects.toThrow("the storage is down");
    expect(store.records).toEqual([]);
  });

  describe("what keeps a credit note from being recorded", () => {
    it("refuses a void that asks for another credit note, without taking a lane", async () => {
      const { store, run } = request({
        request: { creditNote: { ...VOIDED, creditNoteId: "credit-note-2" } },
      });

      expect(await run()).toEqual({ kind: "sale_event_mismatch" });
      expect(store.operations).toEqual([]);
    });

    it("records no attached event for a void that asks for another credit note", async () => {
      const { attachedSaleEvents, run } = request({
        request: { creditNote: { ...VOIDED, creditNoteId: "credit-note-2" } },
      });

      await run();

      expect(attachedSaleEvents.recorded).toEqual([]);
    });

    it("refuses a point of sale that is not the register's real-time one", async () => {
      const { store, run } = request({ request: { pointOfSale: 8 } });

      expect(await run()).toEqual({ kind: "point_of_sale_not_owned" });
      expect(store.records).toEqual([]);
      expect(store.operations).toEqual([
        "recordAttachedSaleEvent",
        "enterLane",
        "registerOwnsPointOfSale",
        "leaveLane",
      ]);
    });

    it("refuses a point of sale of another register", async () => {
      const { store, run } = request({
        registers: [
          [REGISTER_ID, { realTime: 12, offline: 8 }],
          ["register-2", { realTime: 13 }],
        ],
        request: { pointOfSale: 13 },
      });

      expect(await run()).toEqual({ kind: "point_of_sale_not_owned" });
      expect(store.records).toEqual([]);
    });

    it("refuses to credit an invoice of a point of sale that is not the register's", async () => {
      const { store, run } = request({
        registers: [[REGISTER_ID, { realTime: 12 }]],
      });

      expect(await run()).toEqual({ kind: "voucher_not_owned" });
      expect(store.records).toEqual([]);
    });

    it.each([
      ["another credit note", "credit-note-2", "sale_void" as const],
      ["an orphan credit note", "credit-note-3", "orphan" as const],
    ])(
      "refuses a voucher that already has %s, recording no credit note",
      async (_case, otherId, reason) => {
        const { store, run } = request({
          seeded: [[REGISTER_ID, { ...STORED, creditNoteId: otherId, reason }]],
        });

        expect(await run()).toEqual({ kind: "voucher_already_credited" });
        expect(store.records).toEqual([]);
      },
    );

    it("raises the alert about the invoice that already had a credit note, naming the voided sale, inside the lane", async () => {
      const { store, run } = request({
        seeded: [[REGISTER_ID, { ...STORED, creditNoteId: "credit-note-2" }]],
      });

      await run();

      expect(store.alertsRaised).toEqual([
        {
          voucher: { voucherType: 11, pointOfSale: 8, number: 77 },
          saleId: "sale-1",
          at: RECEIVED_AT,
        },
      ]);
      expect(store.operations.slice(-4)).toEqual([
        "creditedToInvoice",
        "raiseInvoiceAlreadyCredited",
        "keepAlreadyCreditedRefusal",
        "leaveLane",
      ]);
    });

    it("keeps the refusal of the voided sale's credit note, inside the lane, beside the alert", async () => {
      const { store, run } = request({
        seeded: [[REGISTER_ID, { ...STORED, creditNoteId: "credit-note-2" }]],
      });

      await run();

      expect(store.refusalsKept).toEqual([
        {
          creditNoteId: "credit-note-1",
          registerId: REGISTER_ID,
          saleId: "sale-1",
          at: RECEIVED_AT,
        },
      ]);
      expect(store.operations.slice(-3)).toEqual([
        "raiseInvoiceAlreadyCredited",
        "keepAlreadyCreditedRefusal",
        "leaveLane",
      ]);
    });

    it.each([
      ["recorded", []],
      ["already recorded", [[REGISTER_ID, STORED]] as [string, CreditNote][]],
    ])("raises no alert when the credit note is %s", async (_case, seeded) => {
      const { store, run } = request({ seeded });

      await run();

      expect(store.alertsRaised).toEqual([]);
      expect(store.refusalsKept).toEqual([]);
    });
  });

  describe("the credit note of a return", () => {
    const returned = { creditNote: RETURNED };

    it("records it with the return that asks for it and the day it must be dated", async () => {
      const { store, run } = request({ request: returned });

      expect(await run()).toEqual({ kind: "recorded" });
      expect(store.records).toMatchObject([
        {
          total: 3_000,
          origin: { kind: "sale_return", returnId: "return-1", issuedOn: "2026-10-06" },
        },
      ]);
      expect(store.recorded.get(CREDIT_NOTE_ID)?.creditNote).toMatchObject({
        reason: "sale_return",
        issueOn: "2026-10-06",
      });
    });

    it("lets an invoice take several credit notes up to its total", async () => {
      const { store, run } = request({
        request: returned,
        invoices: [[VOUCHER, 10_000]],
        seeded: [[REGISTER_ID, { ...STORED, creditNoteId: "credit-note-2", total: 7_000 }]],
      });

      expect(await run()).toEqual({ kind: "recorded" });
      expect(store.records).toHaveLength(1);
    });

    it("refuses a credit note that takes the credit of the invoice beyond its total", async () => {
      const { store, run } = request({
        request: returned,
        invoices: [[VOUCHER, 10_000]],
        seeded: [[REGISTER_ID, { ...STORED, creditNoteId: "credit-note-2", total: 7_001 }]],
      });

      expect(await run()).toEqual({ kind: "voucher_already_credited" });
      expect(store.records).toEqual([]);
      expect(store.alertsRaised).toHaveLength(1);
    });

    it("refuses, raising the alert, a credit note whose storage finds the invoice credited beyond its total by a request racing it", async () => {
      const { store, run } = request({ request: returned });
      store.recordFailure = new VoucherAlreadyCredited();

      expect(await run()).toEqual({ kind: "voucher_already_credited" });
      expect(store.alertsRaised).toHaveLength(1);
      expect(store.refusalsKept).toHaveLength(1);
    });

    it("does not count a credit note the tax authority rejected", async () => {
      const { run } = request({
        request: returned,
        invoices: [[VOUCHER, 10_000]],
        seeded: [
          [
            REGISTER_ID,
            {
              ...STORED,
              creditNoteId: "credit-note-2",
              total: 9_000,
              standing: { kind: "rejected" },
            },
          ],
        ],
      });

      expect(await run()).toEqual({ kind: "recorded" });
    });

    it("records it when the cloud does not know the invoice's total", async () => {
      const { run } = request({
        request: returned,
        invoices: [],
        seeded: [[REGISTER_ID, { ...STORED, creditNoteId: "credit-note-2" }]],
      });

      expect(await run()).toEqual({ kind: "recorded" });
    });
  });

  describe("the sale event a request carries", () => {
    it("is recorded for the requesting device", async () => {
      const { attachedSaleEvents, run } = request();

      await run();

      expect(attachedSaleEvents.recorded).toEqual([{ deviceId: DEVICE_ID, event: SALE_EVENT }]);
    });

    it("is recorded before the point of sale's lane is entered", async () => {
      const { store, run } = request();

      await run();

      expect(store.operations.indexOf("recordAttachedSaleEvent")).toBe(0);
      expect(store.operations.indexOf("enterLane")).toBe(1);
    });

    it("is recorded even when the credit note was already recorded", async () => {
      const { attachedSaleEvents, run } = request({ seeded: [[REGISTER_ID, STORED]] });

      expect(await run()).toMatchObject({ kind: "already_recorded" });
      expect(attachedSaleEvents.recorded).toEqual([{ deviceId: DEVICE_ID, event: SALE_EVENT }]);
    });

    it("is recorded even when the point of sale is not the register's", async () => {
      const { attachedSaleEvents, run } = request({ request: { pointOfSale: 8 } });

      expect(await run()).toEqual({ kind: "point_of_sale_not_owned" });
      expect(attachedSaleEvents.recorded).toEqual([{ deviceId: DEVICE_ID, event: SALE_EVENT }]);
    });

    it("lets a recording failure through and records nothing in the lane", async () => {
      const failure = new Error("inbox unavailable");
      const { store, run } = request({ attachedFailure: failure });

      await expect(run()).rejects.toBe(failure);
      expect(store.operations).toEqual(["recordAttachedSaleEvent"]);
      expect(store.records).toEqual([]);
    });
  });
});

import { describe, expect, it } from "vitest";
import type { PushedEvent } from "../../sync/index.js";
import type { CreditNote, CreditNoteStanding } from "./credit-note-ports.js";
import {
  type RequestSaleVoidCreditNoteInput,
  requestSaleVoidCreditNote,
} from "./request-sale-void-credit-note.js";
import {
  type FakeRegisterPointsOfSale,
  FakeSaleVoidCreditNoteStore,
} from "./test-support/fake-sale-void-credit-notes.js";

const RECEIVED_AT = new Date("2026-10-07T15:31:00.000Z");
const REGISTER_ID = "register-1";
const CREDIT_NOTE_ID = "credit-note-1";

const VOID_EVENT: PushedEvent = {
  event_id: "event-9",
  device_seq: 19,
  aggregate_type: "Sale",
  aggregate_id: "sale-1",
  event_type: "sale_voided",
  schema_version: 3,
  payload: {
    total: 7_500,
    credit_note: {
      id: CREDIT_NOTE_ID,
      total: 7_500,
      receiver_tax_status_code: 5,
      corrects: { voucher_type: 11, point_of_sale: 8, number: 77 },
    },
  },
  occurred_at: "2026-10-07T15:30:00.000Z",
  actor_id: "user-1",
  chain_hmac: "hmac-9",
};

const REQUEST = { creditNoteId: CREDIT_NOTE_ID, pointOfSale: 12, saleEvent: VOID_EVENT };

const STORED: CreditNote = {
  creditNoteId: CREDIT_NOTE_ID,
  pointOfSale: 12,
  associatedVoucher: { voucherType: 11, pointOfSale: 8, number: 77 },
  total: 7_500,
  receiverTaxStatusCode: 5,
  reason: "sale_void",
  standing: { kind: "not_requested" },
};

interface Scenario {
  registers?: [string, FakeRegisterPointsOfSale][];
  seeded?: [string, CreditNote][];
  request?: Partial<RequestSaleVoidCreditNoteInput["request"]>;
  registerId?: string;
}

function request({
  registers = [[REGISTER_ID, { realTime: 12, offline: 8 }]],
  seeded = [],
  request: overrides = {},
  registerId = REGISTER_ID,
}: Scenario = {}) {
  const store = new FakeSaleVoidCreditNoteStore(registers);
  for (const [owner, creditNote] of seeded) {
    store.seed(owner, creditNote);
  }
  return {
    store,
    run: () =>
      requestSaleVoidCreditNote(
        { lanes: store },
        { registerId, request: { ...REQUEST, ...overrides }, receivedAt: RECEIVED_AT },
      ),
  };
}

describe("requestSaleVoidCreditNote", () => {
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
        "enterLane",
        "registerOwnsPointOfSale",
        "recordedCreditNote",
        "registerIssuesFromPointOfSale",
        "recordSaleVoidCreditNote",
        "leaveLane",
      ]);
    });

    it("credits an invoice of the real-time point of sale as well as one of the contingency point of sale", async () => {
      const { store, run } = request({
        request: {
          saleEvent: {
            ...VOID_EVENT,
            payload: {
              ...VOID_EVENT.payload,
              credit_note: {
                ...(VOID_EVENT.payload["credit_note"] as object),
                corrects: { voucher_type: 11, point_of_sale: 12, number: 1204 },
              },
            },
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
        "authorized",
        {
          kind: "authorized",
          number: 42,
          issuedOn: "2026-10-07",
          authorizationCode: "75123456789099",
          authorizationCodeDueOn: "2026-10-17",
        },
        {
          kind: "authorized",
          pointOfSale: 12,
          number: 42,
          issuedOn: "2026-10-07",
          authorizationCode: "75123456789099",
          authorizationCodeDueOn: "2026-10-17",
        },
      ],
    ])(
      "answers the state of a credit note %s, recording nothing",
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

    it("refuses a credit note id that another register recorded", async () => {
      const { store, run } = request({
        registers: [
          [REGISTER_ID, { realTime: 12, offline: 8 }],
          ["register-2", { realTime: 13 }],
        ],
        seeded: [["register-2", { ...STORED, pointOfSale: 13 }]],
      });

      expect(await run()).toEqual({ kind: "credit_note_not_owned" });
      expect(store.records).toEqual([]);
    });
  });

  it("lets a failure of the storage through, recording nothing", async () => {
    const { store, run } = request();
    store.recordFailure = new Error("the storage is down");

    await expect(run()).rejects.toThrow("the storage is down");
    expect(store.records).toEqual([]);
  });

  describe("what keeps a credit note from being recorded", () => {
    it.each([
      ["an event of another type", { event_type: "sale_completed" }],
      [
        "an event of a void that asks for no credit note",
        { payload: { total: 7_500, credit_note: null } },
      ],
      [
        "an event asking for another credit note",
        {
          payload: {
            total: 7_500,
            credit_note: {
              id: "credit-note-2",
              total: 7_500,
              receiver_tax_status_code: 5,
              corrects: { voucher_type: 11, point_of_sale: 8, number: 77 },
            },
          },
        },
      ],
    ])("refuses %s, without taking a lane", async (_case, overrides) => {
      const { store, run } = request({
        request: { saleEvent: { ...VOID_EVENT, ...overrides } },
      });

      expect(await run()).toEqual({ kind: "sale_event_mismatch" });
      expect(store.operations).toEqual([]);
    });

    it("refuses a point of sale that is not the register's real-time one", async () => {
      const { store, run } = request({ request: { pointOfSale: 8 } });

      expect(await run()).toEqual({ kind: "point_of_sale_not_owned" });
      expect(store.records).toEqual([]);
      expect(store.operations).toEqual(["enterLane", "registerOwnsPointOfSale", "leaveLane"]);
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
      "refuses a voucher that already has %s, recording nothing",
      async (_case, otherId, reason) => {
        const { store, run } = request({
          seeded: [[REGISTER_ID, { ...STORED, creditNoteId: otherId, reason }]],
        });

        expect(await run()).toEqual({ kind: "voucher_already_credited" });
        expect(store.records).toEqual([]);
      },
    );
  });
});

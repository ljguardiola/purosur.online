import { describe, expect, it } from "vitest";
import { syncedEventUpcaster } from "./synced-event-upcaster.js";
import { unappliedEventOf } from "./test-support/unapplied-event.js";

const RETURN = "0199b7a0-0000-7000-8000-000000000a01";
const SALE = "0199b7a0-0000-7000-8000-000000000a02";
const SESSION = "0199b7a0-0000-7000-8000-000000000a03";
const LINE = "0199b7a0-0000-7000-8000-000000000a04";
const PAYMENT = "0199b7a0-0000-7000-8000-000000000a07";
const USER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const AT = "2026-10-08T10:00:00.000Z";

const returned = (change: Record<string, unknown> = {}, version = 1) =>
  unappliedEventOf(
    {
      event_id: "0199b7a0-0000-7000-8000-000000000b01",
      device_seq: 1,
      aggregate_type: "Return",
      aggregate_id: RETURN,
      event_type: "sale_returned",
      schema_version: version,
      occurred_at: AT,
      actor_id: USER,
      chain_hmac: "hmac",
      payload: {
        id: RETURN,
        sale_id: SALE,
        register_id: "a41d9e07-52c3-4b68-8f2e-1c7d3a9b6e02",
        device_id: "6f0c2a1e-3b54-4d7a-9c10-5e8a7b2d4f01",
        session_id: SESSION,
        actor_id: USER,
        authorized_by: "0199b7a0-0000-7000-8000-000000000a0f",
        ticket_source: "TYPED",
        occurred_at: AT,
        lines: [
          {
            sale_line_id: LINE,
            product_id: "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06",
            quantity: 2,
            reason: "defective",
            disposition: "discard",
            refunded_amount: 5000,
          },
        ],
        refunds: [
          {
            id: "0199b7a0-0000-7000-8000-000000000a06",
            kind: "REFUND",
            parent_id: PAYMENT,
            method: "CASH",
            provider: "NONE",
            amount: 5000,
            state: "APPROVED",
            occurred_at: AT,
          },
        ],
        cash_movements: [
          {
            id: "0199b7a0-0000-7000-8000-000000000a08",
            type: "REFUND",
            amount: 5000,
            ref_type: "return",
            ref_id: RETURN,
            actor_id: USER,
            occurred_at: AT,
          },
        ],
        stock_movements: [
          {
            id: "0199b7a0-0000-7000-8000-000000000a09",
            sale_line_id: LINE,
            product_id: "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06",
            kind: "return",
            reason: null,
            delta: 2000,
            occurred_at: AT,
          },
          {
            id: "0199b7a0-0000-7000-8000-000000000a0a",
            sale_line_id: LINE,
            product_id: "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06",
            kind: "loss",
            reason: "return_discard",
            delta: -2000,
            occurred_at: AT,
          },
        ],
        ...change,
      },
    },
    {},
  );

describe("decoding a sale_returned event", () => {
  it("reads the return, who authorized it and how the ticket was read", () => {
    expect(syncedEventUpcaster.decode(returned())).toMatchObject({
      kind: "fact",
      fact: {
        kind: "sale_returned",
        saleReturn: {
          id: RETURN,
          saleId: SALE,
          sessionId: SESSION,
          actorId: USER,
          authorizedBy: "0199b7a0-0000-7000-8000-000000000a0f",
          ticketSource: "TYPED",
          occurredAt: new Date(AT),
        },
      },
    });
  });

  it("reads each line with what the cashier chose and what it refunded", () => {
    expect(syncedEventUpcaster.decode(returned())).toMatchObject({
      fact: {
        saleReturn: {
          lines: [
            {
              saleLineId: LINE,
              productId: "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06",
              quantity: 2,
              reason: "defective",
              disposition: "discard",
              refundedAmount: 5000,
            },
          ],
        },
      },
    });
  });

  it("reads the refund against the payment it was imputed to", () => {
    expect(syncedEventUpcaster.decode(returned())).toMatchObject({
      fact: {
        saleReturn: {
          refunds: [
            {
              id: "0199b7a0-0000-7000-8000-000000000a06",
              paymentId: PAYMENT,
              method: "CASH",
              provider: "NONE",
              amount: 5000,
              state: "APPROVED",
              occurredAt: new Date(AT),
            },
          ],
        },
      },
    });
  });

  it("reads the cash movement and the stock movements", () => {
    expect(syncedEventUpcaster.decode(returned())).toMatchObject({
      fact: {
        saleReturn: {
          cashMovements: [
            {
              id: "0199b7a0-0000-7000-8000-000000000a08",
              type: "REFUND",
              amount: 5000,
              actorId: USER,
              occurredAt: new Date(AT),
            },
          ],
          stockMovements: [
            {
              id: "0199b7a0-0000-7000-8000-000000000a09",
              saleLineId: LINE,
              productId: "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06",
              kind: "return",
              reason: null,
              delta: 2000,
            },
            {
              id: "0199b7a0-0000-7000-8000-000000000a0a",
              saleLineId: LINE,
              productId: "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06",
              kind: "loss",
              reason: "return_discard",
              delta: -2000,
            },
          ],
        },
      },
    });
  });

  it("reads a return nobody authorized as having no authorizer", () => {
    expect(syncedEventUpcaster.decode(returned({ authorized_by: null }))).toMatchObject({
      fact: { saleReturn: { authorizedBy: null } },
    });
  });

  it("is unreadable, naming the refused member, when a line has no disposition", () => {
    const decoded = syncedEventUpcaster.decode(
      returned({
        lines: [
          {
            sale_line_id: LINE,
            product_id: "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06",
            quantity: 2,
            reason: "defective",
            disposition: null,
            refunded_amount: 5000,
          },
        ],
      }),
    );

    expect(decoded).toMatchObject({
      kind: "unreadable",
      reason: expect.stringContaining("lines.0.disposition"),
    });
  });
});

describe("decoding the credit note of a sale_returned event", () => {
  const creditNote = {
    id: "0199b7a0-0000-7000-8000-000000000a0b",
    total: 5000,
    receiver_tax_status_code: 5,
    corrects: { voucher_type: 11, point_of_sale: 7, number: 42 },
    issued_on: "2026-10-08",
  };

  it("reads a version 1 return as asking for no credit note", () => {
    expect(syncedEventUpcaster.decode(returned())).toMatchObject({
      fact: { kind: "sale_returned", creditNote: null },
    });
  });

  it("reads a version 2 return that asks for no credit note", () => {
    expect(syncedEventUpcaster.decode(returned({ credit_note: null }, 2))).toMatchObject({
      fact: { kind: "sale_returned", creditNote: null },
    });
  });

  it("reads the credit note a version 2 return asks for, for the sale it returns from and dated by the return", () => {
    expect(syncedEventUpcaster.decode(returned({ credit_note: creditNote }, 2))).toMatchObject({
      kind: "fact",
      fact: {
        kind: "sale_returned",
        creditNote: {
          creditNoteId: "0199b7a0-0000-7000-8000-000000000a0b",
          saleId: SALE,
          total: 5000,
          receiverTaxStatusCode: 5,
          correctedVoucher: { voucherType: 11, pointOfSale: 7, number: 42 },
          origin: { kind: "sale_return", returnId: RETURN, issuedOn: "2026-10-08" },
        },
      },
    });
  });

  it("reads a credit note that waits for the invoice of its sale as correcting none yet", () => {
    const waiting = { ...creditNote, receiver_tax_status_code: null, corrects: null };

    expect(syncedEventUpcaster.decode(returned({ credit_note: waiting }, 2))).toMatchObject({
      fact: { creditNote: { receiverTaxStatusCode: null, correctedVoucher: null } },
    });
  });

  it("is unreadable, naming the refused member, when a version 2 return says nothing about its credit note", () => {
    expect(syncedEventUpcaster.decode(returned({}, 2))).toMatchObject({
      kind: "unreadable",
      reason: expect.stringContaining("credit_note"),
    });
  });
});

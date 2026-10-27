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

const returned = (change: Record<string, unknown> = {}) =>
  unappliedEventOf(
    {
      event_id: "0199b7a0-0000-7000-8000-000000000b01",
      device_seq: 1,
      aggregate_type: "Return",
      aggregate_id: RETURN,
      event_type: "sale_returned",
      schema_version: 1,
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

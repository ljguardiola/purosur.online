import { recordedPushes } from "@purosur/contracts/sync/test-support";
import type { PushedEvent } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { syncedEventUpcaster } from "./synced-event-upcaster.js";
import { unappliedEventOf } from "./test-support/unapplied-event.js";

const RECORDED_EVENTS = recordedPushes().flatMap(({ push }) => push.events);

const USER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const SALE = "01a1122a-0305-7189-87d0-7f7ebbd4910e";
const SESSION = "01a1122a-0300-77a5-a405-35ca2fe42d77";

function pushed(overrides: Partial<PushedEvent>): PushedEvent {
  return {
    event_id: "01a1122a-0306-7000-8000-000000000001",
    device_seq: 1,
    aggregate_type: "Sale",
    aggregate_id: SALE,
    event_type: "sale_completed",
    schema_version: 2,
    payload: {},
    occurred_at: "2026-10-06T11:20:00.000Z",
    actor_id: USER,
    chain_hmac: "hmac",
    ...overrides,
  };
}

const saleLine = {
  id: "01a1122a-0305-7189-87d0-8256a353fd40",
  product_id: "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06",
  product_name: "Azucar",
  quantity: 2,
  list_unit_price: 2400,
  price_list_id: "9a6e2b1d-4c78-4f13-b5a0-8e7d3c1f9a07",
  promotion_id: null,
  discount_amount: 0,
  promotions: [],
  line_total: 4800,
};

const salePayment = {
  id: "01a1122a-0305-7189-87d0-9a1b2c3d4e5f",
  kind: "SALE",
  method: "CASH",
  provider: "NONE",
  amount: 5000,
  tendered: 5000,
  state: "APPROVED",
  occurred_at: "2026-10-06T11:20:00.000Z",
};

const saleCashMovement = {
  id: "01a1122a-0307-7567-ae51-2f83f6bb6afa",
  type: "SALE",
  amount: 4800,
  ref_type: "sale",
  ref_id: SALE,
  actor_id: USER,
  occurred_at: "2026-10-06T11:20:00.000Z",
};

const saleFields = {
  id: SALE,
  register_id: "a41d9e07-52c3-4b68-8f2e-1c7d3a9b6e02",
  device_id: "6f0c2a1e-3b54-4d7a-9c10-5e8a7b2d4f01",
  session_id: SESSION,
  actor_id: USER,
  occurred_at: "2026-10-06T11:20:00.000Z",
  total: 4800,
  lines: [saleLine],
  cash_movements: [saleCashMovement],
};

const decodedLine = {
  id: saleLine.id,
  productId: saleLine.product_id,
  productName: "Azucar",
  quantity: 2,
  listUnitPrice: 2400,
  priceListId: saleLine.price_list_id,
  promotionId: null,
  discountAmount: 0,
  lineTotal: 4800,
};

const decodedMovement = {
  id: saleCashMovement.id,
  type: "SALE",
  amount: 4800,
  actorId: USER,
  occurredAt: new Date("2026-10-06T11:20:00.000Z"),
};

describe("decoding the events the registers pushed", () => {
  const upcaster = syncedEventUpcaster;

  it.each(
    RECORDED_EVENTS.map((event): [string, PushedEvent] => [
      `${event.event_type} v${event.schema_version}`,
      event,
    ]),
  )("reads every recorded %s as a fact", (_name, event) => {
    expect(upcaster.decode(unappliedEventOf(event)).kind).toBe("fact");
  });

  it("reads a version 2 sale as completed when it was charged", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          payload: {
            ...saleFields,
            payments: [{ ...salePayment, authorized_by: null, confirmed_at: null }],
          },
        }),
      ),
    );

    expect(decoded).toEqual({
      kind: "fact",
      fact: {
        kind: "sale_completed",
        sale: {
          id: SALE,
          sessionId: SESSION,
          actorId: USER,
          completedAt: new Date("2026-10-06T11:20:00.000Z"),
          total: 4800,
          lines: [decodedLine],
          payments: [
            {
              id: salePayment.id,
              method: "CASH",
              provider: "NONE",
              amount: 5000,
              tendered: 5000,
              state: "APPROVED",
              occurredAt: new Date("2026-10-06T11:20:00.000Z"),
              authorizedBy: null,
              confirmedAt: null,
            },
          ],
          cashMovements: [decodedMovement],
          stockMovements: null,
        },
      },
    });
  });

  it("reads a version 3 sale with the stock each of its lines moved", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          schema_version: 3,
          payload: {
            ...saleFields,
            payments: [{ ...salePayment, authorized_by: null, confirmed_at: null }],
            stock_movements: [
              {
                id: "01a1122a-0309-7000-8000-00000000bbb1",
                sale_line_id: saleLine.id,
                product_id: saleLine.product_id,
                delta: -2000,
              },
            ],
          },
        }),
      ),
    );

    expect(decoded).toMatchObject({
      kind: "fact",
      fact: {
        kind: "sale_completed",
        sale: {
          completedAt: new Date("2026-10-06T11:20:00.000Z"),
          stockMovements: [
            {
              id: "01a1122a-0309-7000-8000-00000000bbb1",
              saleLineId: saleLine.id,
              productId: saleLine.product_id,
              delta: -2000,
            },
          ],
        },
      },
    });
  });

  it("reads a version 1 sale as one whose register reports no stock movements", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          schema_version: 1,
          payload: {
            ...saleFields,
            completed_at: "2026-10-06T11:20:00.000Z",
            payments: [salePayment],
          },
        }),
      ),
    );

    expect(decoded).toMatchObject({ fact: { sale: { stockMovements: null } } });
  });

  it("reads a transfer's authorization and confirmation", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          payload: {
            ...saleFields,
            payments: [
              {
                ...salePayment,
                method: "TRANSFER",
                tendered: null,
                authorized_by: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
                confirmed_at: "2026-10-06T11:21:00.000Z",
              },
            ],
          },
        }),
      ),
    );

    expect(decoded).toMatchObject({
      kind: "fact",
      fact: {
        sale: {
          payments: [
            {
              method: "TRANSFER",
              tendered: null,
              authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
              confirmedAt: new Date("2026-10-06T11:21:00.000Z"),
            },
          ],
        },
      },
    });
  });

  it("reads a version 1 sale as the same sale, dated when it was completed and with no authorization on a cash payment", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          schema_version: 1,
          occurred_at: "2026-10-06T11:10:00.000Z",
          payload: {
            ...saleFields,
            completed_at: "2026-10-06T11:20:00.000Z",
            payments: [salePayment],
          },
        }),
      ),
    );

    expect(decoded).toMatchObject({
      kind: "fact",
      fact: {
        kind: "sale_completed",
        sale: {
          completedAt: new Date("2026-10-06T11:20:00.000Z"),
          payments: [{ authorizedBy: null, confirmedAt: null }],
        },
      },
    });
  });

  it("reads a cancelled sale with its payments, refunds and the person who authorized it", () => {
    const refund = {
      id: "01a1122a-0308-7000-8000-00000000aaa1",
      kind: "REFUND",
      parent_id: salePayment.id,
      method: "CASH",
      provider: "NONE",
      amount: 5000,
      state: "APPROVED",
      occurred_at: "2026-10-06T11:25:00.000Z",
    };
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          event_type: "sale_cancelled",
          schema_version: 1,
          occurred_at: "2026-10-06T11:25:00.000Z",
          payload: {
            ...saleFields,
            occurred_at: "2026-10-06T11:25:00.000Z",
            authorized_by: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
            payments: [{ ...salePayment, authorized_by: null, confirmed_at: null }],
            refunds: [refund],
          },
        }),
      ),
    );

    expect(decoded).toEqual({
      kind: "fact",
      fact: {
        kind: "sale_cancelled",
        sale: {
          id: SALE,
          sessionId: SESSION,
          actorId: USER,
          authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
          cancelledAt: new Date("2026-10-06T11:25:00.000Z"),
          total: 4800,
          lines: [decodedLine],
          payments: [
            {
              id: salePayment.id,
              method: "CASH",
              provider: "NONE",
              amount: 5000,
              tendered: 5000,
              state: "APPROVED",
              occurredAt: new Date("2026-10-06T11:20:00.000Z"),
              authorizedBy: null,
              confirmedAt: null,
            },
          ],
          refunds: [
            {
              id: refund.id,
              paymentId: salePayment.id,
              method: "CASH",
              provider: "NONE",
              amount: 5000,
              state: "APPROVED",
              occurredAt: new Date("2026-10-06T11:25:00.000Z"),
            },
          ],
          cashMovements: [decodedMovement],
        },
      },
    });
  });

  it("reads a cancelled sale nobody else authorized as having no authorizer", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          event_type: "sale_cancelled",
          schema_version: 1,
          payload: {
            ...saleFields,
            authorized_by: null,
            payments: [
              {
                ...salePayment,
                method: "TRANSFER",
                tendered: null,
                authorized_by: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
                confirmed_at: "2026-10-06T11:21:00.000Z",
              },
            ],
            refunds: [
              {
                id: "01a1122a-0308-7000-8000-00000000aaa2",
                kind: "REFUND",
                parent_id: salePayment.id,
                method: "TRANSFER",
                provider: "NONE",
                amount: 5000,
                state: "PENDING",
                occurred_at: "2026-10-06T11:20:00.000Z",
              },
            ],
          },
        }),
      ),
    );

    expect(decoded).toMatchObject({
      kind: "fact",
      fact: {
        sale: { authorizedBy: null, refunds: [{ method: "TRANSFER", state: "PENDING" }] },
      },
    });
  });

  it("reads an opened cash session by its aggregate", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          aggregate_type: "CashSession",
          aggregate_id: SESSION,
          event_type: "cash_session_opened",
          schema_version: 1,
          payload: {
            opened_by: USER,
            opened_at: "2026-10-06T11:00:00.000Z",
            opening_float: 10000,
          },
        }),
      ),
    );

    expect(decoded).toEqual({
      kind: "fact",
      fact: {
        kind: "cash_session_opened",
        session: {
          id: SESSION,
          openedBy: USER,
          openedAt: new Date("2026-10-06T11:00:00.000Z"),
          openingFloat: 10000,
        },
      },
    });
  });

  it("reads a closed cash session by its aggregate", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          aggregate_type: "CashSession",
          aggregate_id: SESSION,
          event_type: "cash_session_closed",
          schema_version: 1,
          payload: {
            closed_by: USER,
            closed_at: "2026-10-06T11:44:00.000Z",
            expected_cash: 9900,
            counted_cash: 9800,
            difference: -100,
          },
        }),
      ),
    );

    expect(decoded).toEqual({
      kind: "fact",
      fact: {
        kind: "cash_session_closed",
        session: {
          id: SESSION,
          closedBy: USER,
          closedAt: new Date("2026-10-06T11:44:00.000Z"),
          expectedCash: 9900,
          countedCash: 9800,
          difference: -100,
        },
      },
    });
  });

  it("reads a cash movement as belonging to the session of its aggregate", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          aggregate_type: "CashSession",
          aggregate_id: SESSION,
          event_type: "cash_movement_recorded",
          schema_version: 1,
          payload: {
            type: "WITHDRAWAL",
            amount: 1000,
            reason: "Retiro parcial",
            ref_type: null,
            ref_id: null,
            actor_id: USER,
            authorized_by: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
            occurred_at: "2026-10-06T11:08:00.000Z",
          },
        }),
      ),
    );

    expect(decoded).toEqual({
      kind: "fact",
      fact: {
        kind: "cash_movement_recorded",
        movement: {
          sessionId: SESSION,
          type: "WITHDRAWAL",
          amount: 1000,
          reason: "Retiro parcial",
          refType: null,
          refId: null,
          actorId: USER,
          authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
          occurredAt: new Date("2026-10-06T11:08:00.000Z"),
        },
      },
    });
  });

  it("reads a failed fiscal gate", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          event_type: "fiscal_gate_failed",
          schema_version: 1,
          payload: {
            sale_id: SALE,
            register_id: saleFields.register_id,
            reason: "issuer_identification_missing",
            evaluated_at: "2026-10-06T11:20:00.000Z",
          },
        }),
      ),
    );

    expect(decoded).toEqual({
      kind: "fact",
      fact: {
        kind: "fiscal_gate_failed",
        gateFailure: {
          saleId: SALE,
          reason: "issuer_identification_missing",
          evaluatedAt: new Date("2026-10-06T11:20:00.000Z"),
        },
      },
    });
  });

  it("cannot read an event type and version no schema describes", () => {
    const decoded = upcaster.decode(unappliedEventOf(pushed({ schema_version: 4 })));

    expect(decoded).toEqual({
      kind: "unreadable",
      reason: "no schema reads sale_completed version 4",
    });
  });

  it("cannot read a payload its schema refuses, and says which member", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          event_type: "cash_session_opened",
          schema_version: 1,
          payload: { opened_by: USER, opened_at: "2026-10-06T11:00:00.000Z" },
        }),
      ),
    );

    expect(decoded.kind).toBe("unreadable");
    expect(decoded).toMatchObject({ reason: expect.stringContaining("opening_float") });
  });
});

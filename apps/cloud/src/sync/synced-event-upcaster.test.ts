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
  weightSource: null,
  manualAdjustment: null,
  quantity: 2,
  listUnitPrice: 2400,
  priceListId: saleLine.price_list_id,
  promotionId: null,
  discountAmount: 0,
  saleDiscountShare: 0,
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
          operationNumber: null,
          total: 4800,
          saleDiscount: null,
          saleDiscountAmount: 0,
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

  it("reads a version 4 sale with the operation number its register gave it", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          schema_version: 4,
          payload: {
            ...saleFields,
            operation_number: 482,
            payments: [{ ...salePayment, authorized_by: null, confirmed_at: null }],
            stock_movements: [],
          },
        }),
      ),
    );

    expect(decoded).toMatchObject({
      kind: "fact",
      fact: { kind: "sale_completed", sale: { operationNumber: 482, stockMovements: [] } },
    });
  });

  it("reads a version 5 sale with its Mercado Pago QR payment as an approved payment without a tendered amount or an authorizer", () => {
    const qrPayment = {
      ...salePayment,
      id: "01a1122a-0305-7189-87d0-9a1b2c3d4e60",
      method: "QR",
      provider: "MERCADOPAGO_QR",
      tendered: null,
      authorized_by: null,
      confirmed_at: null,
    };
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          schema_version: 5,
          payload: {
            ...saleFields,
            operation_number: 483,
            payments: [qrPayment],
            stock_movements: [],
          },
        }),
      ),
    );

    expect(decoded).toMatchObject({
      kind: "fact",
      fact: {
        kind: "sale_completed",
        sale: {
          operationNumber: 483,
          stockMovements: [],
          payments: [
            {
              id: qrPayment.id,
              method: "QR",
              provider: "MERCADOPAGO_QR",
              amount: 5000,
              tendered: null,
              state: "APPROVED",
              authorizedBy: null,
              confirmedAt: null,
            },
          ],
        },
      },
    });
  });

  it.each([1, 2, 3])("reads a version %s sale as one with no operation number", (version) => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          schema_version: version,
          payload: {
            ...saleFields,
            ...(version === 1 ? { completed_at: "2026-10-06T11:20:00.000Z" } : {}),
            payments: [
              version === 1
                ? salePayment
                : { ...salePayment, authorized_by: null, confirmed_at: null },
            ],
            ...(version === 3 ? { stock_movements: [] } : {}),
          },
        }),
      ),
    );

    expect(decoded).toMatchObject({ fact: { sale: { operationNumber: null } } });
  });

  describe("the source of the weight of a line sold by weight", () => {
    const weighedLine = {
      ...saleLine,
      id: "01a1122a-0305-7189-87d0-8256a353fd41",
      product_name: "Queso cremoso",
      weight_source: "MANUAL",
      quantity: 1250,
      list_unit_price: 9000,
      line_total: 11250,
    };
    const unitLine = { ...saleLine, weight_source: null };

    it("reads a version 6 sale with each line's weight and the source of its weight", () => {
      const decoded = upcaster.decode(
        unappliedEventOf(
          pushed({
            schema_version: 6,
            payload: {
              ...saleFields,
              lines: [unitLine, weighedLine],
              operation_number: 484,
              payments: [{ ...salePayment, authorized_by: null, confirmed_at: null }],
              stock_movements: [],
            },
          }),
        ),
      );

      expect(decoded).toMatchObject({
        kind: "fact",
        fact: {
          kind: "sale_completed",
          sale: {
            operationNumber: 484,
            lines: [
              { id: unitLine.id, quantity: 2, weightSource: null },
              { id: weighedLine.id, quantity: 1250, weightSource: "MANUAL" },
            ],
          },
        },
      });
    });

    it("reads a version 2 cancelled sale with each line's weight and the source of its weight", () => {
      const decoded = upcaster.decode(
        unappliedEventOf(
          pushed({
            event_type: "sale_cancelled",
            schema_version: 2,
            payload: {
              ...saleFields,
              lines: [weighedLine],
              authorized_by: null,
              payments: [{ ...salePayment, authorized_by: null, confirmed_at: null }],
              refunds: [
                {
                  id: "01a1122a-0308-7000-8000-00000000aaa3",
                  kind: "REFUND",
                  parent_id: salePayment.id,
                  method: "CASH",
                  provider: "NONE",
                  amount: 5000,
                  state: "APPROVED",
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
          kind: "sale_cancelled",
          sale: { lines: [{ id: weighedLine.id, quantity: 1250, weightSource: "MANUAL" }] },
        },
      });
    });

    it("refuses a version 6 sale whose line has an unknown weight source", () => {
      const decoded = upcaster.decode(
        unappliedEventOf(
          pushed({
            schema_version: 6,
            payload: {
              ...saleFields,
              lines: [{ ...weighedLine, weight_source: "SENSOR" }],
              operation_number: 484,
              payments: [{ ...salePayment, authorized_by: null, confirmed_at: null }],
              stock_movements: [],
            },
          }),
        ),
      );

      expect(decoded.kind).toBe("unreadable");
    });

    it.each([1, 2, 3, 4, 5])(
      "reads every line of a version %s sale as sold by the unit",
      (version) => {
        const decoded = upcaster.decode(
          unappliedEventOf(
            pushed({
              schema_version: version,
              payload: {
                ...saleFields,
                ...(version === 1 ? { completed_at: "2026-10-06T11:20:00.000Z" } : {}),
                ...(version >= 4 ? { operation_number: 1 } : {}),
                ...(version >= 3 ? { stock_movements: [] } : {}),
                payments: [
                  version === 1
                    ? salePayment
                    : { ...salePayment, authorized_by: null, confirmed_at: null },
                ],
              },
            }),
          ),
        );

        expect(decoded).toMatchObject({ fact: { sale: { lines: [{ weightSource: null }] } } });
      },
    );
  });

  describe("the manual adjustment of a sale's line", () => {
    const adjustedLine = {
      ...saleLine,
      weight_source: null,
      discount_amount: 480,
      line_total: 4320,
      manual_adjustment: {
        kind: "PERCENT",
        value: 10,
        reason: "Cliente frecuente",
        authorized_by: "6f0c2a1e-3b54-4d7a-9c10-5e8a7b2d4f09",
      },
    };
    const priceLine = {
      ...saleLine,
      id: "01a1122a-0305-7189-87d0-8256a353fd41",
      weight_source: null,
      line_total: 4000,
      manual_adjustment: {
        kind: "PRICE",
        value: 2000,
        reason: "Caja abierta",
        authorized_by: null,
      },
    };
    const amountLine = {
      ...saleLine,
      id: "01a1122a-0305-7189-87d0-8256a353fd42",
      weight_source: null,
      discount_amount: 300,
      line_total: 4500,
      manual_adjustment: {
        kind: "AMOUNT",
        value: 300,
        reason: "Envase danado",
        authorized_by: null,
      },
    };
    const lines = [adjustedLine, priceLine, amountLine];
    const decodedAdjustments = [
      {
        id: adjustedLine.id,
        manualAdjustment: {
          kind: "PERCENT",
          percent: 10,
          reason: "Cliente frecuente",
          authorizedBy: "6f0c2a1e-3b54-4d7a-9c10-5e8a7b2d4f09",
        },
      },
      {
        id: priceLine.id,
        manualAdjustment: {
          kind: "PRICE",
          unitPrice: 2000,
          reason: "Caja abierta",
          authorizedBy: null,
        },
      },
      {
        id: amountLine.id,
        manualAdjustment: {
          kind: "AMOUNT",
          amount: 300,
          reason: "Envase danado",
          authorizedBy: null,
        },
      },
    ];

    it("reads a version 7 sale with each line's manual adjustment, its reason and who authorized it", () => {
      const decoded = upcaster.decode(
        unappliedEventOf(
          pushed({
            schema_version: 7,
            payload: {
              ...saleFields,
              lines,
              operation_number: 484,
              payments: [{ ...salePayment, authorized_by: null, confirmed_at: null }],
              stock_movements: [],
            },
          }),
        ),
      );

      expect(decoded).toMatchObject({
        kind: "fact",
        fact: { kind: "sale_completed", sale: { lines: decodedAdjustments } },
      });
    });

    it("reads a version 3 cancelled sale with each line's manual adjustment", () => {
      const decoded = upcaster.decode(
        unappliedEventOf(
          pushed({
            event_type: "sale_cancelled",
            schema_version: 3,
            payload: {
              ...saleFields,
              lines,
              authorized_by: null,
              payments: [{ ...salePayment, authorized_by: null, confirmed_at: null }],
              refunds: [
                {
                  id: "01a1122a-0308-7000-8000-00000000aaa3",
                  kind: "REFUND",
                  parent_id: salePayment.id,
                  method: "CASH",
                  provider: "NONE",
                  amount: 5000,
                  state: "APPROVED",
                  occurred_at: "2026-10-06T11:20:00.000Z",
                },
              ],
            },
          }),
        ),
      );

      expect(decoded).toMatchObject({
        kind: "fact",
        fact: { kind: "sale_cancelled", sale: { lines: decodedAdjustments } },
      });
    });

    it("refuses a version 7 sale whose line has an adjustment of an unknown kind", () => {
      const decoded = upcaster.decode(
        unappliedEventOf(
          pushed({
            schema_version: 7,
            payload: {
              ...saleFields,
              lines: [
                {
                  ...adjustedLine,
                  manual_adjustment: { ...adjustedLine.manual_adjustment, kind: "BONUS" },
                },
              ],
              operation_number: 484,
              payments: [{ ...salePayment, authorized_by: null, confirmed_at: null }],
              stock_movements: [],
            },
          }),
        ),
      );

      expect(decoded.kind).toBe("unreadable");
    });

    it.each([1, 2, 3, 4, 5, 6])(
      "reads every line of a version %s sale as having no manual adjustment",
      (version) => {
        const decoded = upcaster.decode(
          unappliedEventOf(
            pushed({
              schema_version: version,
              payload: {
                ...saleFields,
                ...(version === 1 ? { completed_at: "2026-10-06T11:20:00.000Z" } : {}),
                ...(version >= 4 ? { operation_number: 1 } : {}),
                ...(version >= 3 ? { stock_movements: [] } : {}),
                ...(version >= 6 ? { lines: [{ ...saleLine, weight_source: null }] } : {}),
                payments: [
                  version === 1
                    ? salePayment
                    : { ...salePayment, authorized_by: null, confirmed_at: null },
                ],
              },
            }),
          ),
        );

        expect(decoded).toMatchObject({
          fact: { sale: { lines: [{ manualAdjustment: null }] } },
        });
      },
    );

    it("reads every line of a version 2 cancelled sale as having no manual adjustment", () => {
      const decoded = upcaster.decode(
        unappliedEventOf(
          pushed({
            event_type: "sale_cancelled",
            schema_version: 2,
            payload: {
              ...saleFields,
              lines: [{ ...saleLine, weight_source: null }],
              authorized_by: null,
              payments: [{ ...salePayment, authorized_by: null, confirmed_at: null }],
              refunds: [
                {
                  id: "01a1122a-0308-7000-8000-00000000aaa3",
                  kind: "REFUND",
                  parent_id: salePayment.id,
                  method: "CASH",
                  provider: "NONE",
                  amount: 5000,
                  state: "APPROVED",
                  occurred_at: "2026-10-06T11:20:00.000Z",
                },
              ],
            },
          }),
        ),
      );

      expect(decoded).toMatchObject({
        fact: { sale: { lines: [{ manualAdjustment: null }] } },
      });
    });
  });

  describe("the discount on a sale's total", () => {
    const sharedLines = [
      { ...saleLine, weight_source: null, manual_adjustment: null, sale_discount_share: 300 },
      {
        ...saleLine,
        id: "01a1122a-0305-7189-87d0-8256a353fd43",
        weight_source: null,
        manual_adjustment: null,
        line_total: 4500,
        sale_discount_share: 100,
      },
    ];
    const saleDiscount = {
      kind: "PERCENT",
      value: 4,
      amount: 400,
      reason: "Compra grande",
      authorized_by: "6f0c2a1e-3b54-4d7a-9c10-5e8a7b2d4f09",
    };
    const decodedDiscount = {
      saleDiscount: {
        kind: "PERCENT",
        percent: 4,
        reason: "Compra grande",
        authorizedBy: "6f0c2a1e-3b54-4d7a-9c10-5e8a7b2d4f09",
      },
      saleDiscountAmount: 400,
      lines: [{ saleDiscountShare: 300 }, { saleDiscountShare: 100 }],
    };
    const refund = {
      id: "01a1122a-0308-7000-8000-00000000aaa3",
      kind: "REFUND",
      parent_id: salePayment.id,
      method: "CASH",
      provider: "NONE",
      amount: 5000,
      state: "APPROVED",
      occurred_at: "2026-10-06T11:20:00.000Z",
    };
    const payment = { ...salePayment, authorized_by: null, confirmed_at: null };
    const completed = (change: Record<string, unknown> = {}) =>
      pushed({
        schema_version: 8,
        payload: {
          ...saleFields,
          lines: sharedLines,
          sale_discount: saleDiscount,
          operation_number: 484,
          payments: [payment],
          stock_movements: [],
          ...change,
        },
      });
    const cancelled = (change: Record<string, unknown> = {}, schemaVersion = 4) =>
      pushed({
        event_type: "sale_cancelled",
        schema_version: schemaVersion,
        payload: {
          ...saleFields,
          lines: sharedLines,
          sale_discount: saleDiscount,
          authorized_by: null,
          payments: [payment],
          refunds: [refund],
          ...change,
        },
      });

    it("reads a version 8 sale with its discount and each line's share of it", () => {
      expect(upcaster.decode(unappliedEventOf(completed()))).toMatchObject({
        kind: "fact",
        fact: { kind: "sale_completed", sale: decodedDiscount },
      });
    });

    it("reads a version 8 sale paid on the standalone terminal with who confirmed it and when", () => {
      const standalone = {
        ...salePayment,
        method: "STANDALONE_TERMINAL",
        provider: "EXTERNAL_TERMINAL",
        tendered: null,
        authorized_by: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
        confirmed_at: "2026-10-06T11:21:00.000Z",
      };

      expect(
        upcaster.decode(unappliedEventOf(completed({ payments: [standalone] }))),
      ).toMatchObject({
        kind: "fact",
        fact: {
          kind: "sale_completed",
          sale: {
            payments: [
              {
                method: "STANDALONE_TERMINAL",
                provider: "EXTERNAL_TERMINAL",
                tendered: null,
                authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
                confirmedAt: new Date("2026-10-06T11:21:00.000Z"),
              },
            ],
          },
        },
      });
    });

    it("reads a version 5 cancelled sale with the standalone terminal payment and its pending refund", () => {
      const standalone = {
        ...salePayment,
        method: "STANDALONE_TERMINAL",
        provider: "EXTERNAL_TERMINAL",
        tendered: null,
        authorized_by: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
        confirmed_at: "2026-10-06T11:21:00.000Z",
      };
      const pending = {
        ...refund,
        parent_id: standalone.id,
        method: "STANDALONE_TERMINAL",
        provider: "EXTERNAL_TERMINAL",
        state: "PENDING",
      };

      const decoded = upcaster.decode(
        unappliedEventOf(cancelled({ payments: [standalone], refunds: [pending] }, 5)),
      );

      expect(decoded).toMatchObject({
        kind: "fact",
        fact: {
          kind: "sale_cancelled",
          sale: {
            payments: [{ method: "STANDALONE_TERMINAL", provider: "EXTERNAL_TERMINAL" }],
            refunds: [
              {
                paymentId: standalone.id,
                method: "STANDALONE_TERMINAL",
                provider: "EXTERNAL_TERMINAL",
                state: "PENDING",
              },
            ],
          },
        },
      });
    });

    it("reads a version 6 cancelled sale with its QR payment and pending QR refund", () => {
      const qr = {
        ...salePayment,
        method: "QR",
        provider: "MERCADOPAGO_QR",
        tendered: null,
      };
      const pending = {
        ...refund,
        parent_id: qr.id,
        method: "QR",
        provider: "MERCADOPAGO_QR",
        state: "PENDING",
      };

      const decoded = upcaster.decode(
        unappliedEventOf(cancelled({ payments: [qr], refunds: [pending] }, 6)),
      );

      expect(decoded).toMatchObject({
        kind: "fact",
        fact: {
          kind: "sale_cancelled",
          sale: {
            payments: [{ method: "QR", provider: "MERCADOPAGO_QR" }],
            refunds: [
              { paymentId: qr.id, method: "QR", provider: "MERCADOPAGO_QR", state: "PENDING" },
            ],
          },
        },
      });
    });

    it("reads a version 4 cancelled sale with its discount and each line's share of it", () => {
      expect(upcaster.decode(unappliedEventOf(cancelled()))).toMatchObject({
        kind: "fact",
        fact: { kind: "sale_cancelled", sale: decodedDiscount },
      });
    });

    it("reads a fixed amount discount without an authorizer", () => {
      const decoded = upcaster.decode(
        unappliedEventOf(
          completed({
            sale_discount: { ...saleDiscount, kind: "AMOUNT", value: 400, authorized_by: null },
          }),
        ),
      );

      expect(decoded).toMatchObject({
        fact: {
          sale: {
            saleDiscount: {
              kind: "AMOUNT",
              amount: 400,
              reason: "Compra grande",
              authorizedBy: null,
            },
          },
        },
      });
    });

    it("reads a sale without a discount as having none and no line sharing it", () => {
      const lines = sharedLines.map((line) => ({ ...line, sale_discount_share: 0 }));

      expect(
        upcaster.decode(unappliedEventOf(completed({ sale_discount: null, lines }))),
      ).toMatchObject({
        fact: {
          sale: {
            saleDiscount: null,
            saleDiscountAmount: 0,
            lines: [{ saleDiscountShare: 0 }, { saleDiscountShare: 0 }],
          },
        },
      });
    });

    it("refuses a version 8 sale whose discount is of an unknown kind", () => {
      const decoded = upcaster.decode(
        unappliedEventOf(completed({ sale_discount: { ...saleDiscount, kind: "PRICE" } })),
      );

      expect(decoded.kind).toBe("unreadable");
    });

    it.each([1, 2, 3, 4, 5, 6, 7])(
      "reads a version %s sale as having no discount on its total",
      (version) => {
        const decoded = upcaster.decode(
          unappliedEventOf(
            pushed({
              schema_version: version,
              payload: {
                ...saleFields,
                ...(version === 1 ? { completed_at: "2026-10-06T11:20:00.000Z" } : {}),
                ...(version >= 4 ? { operation_number: 1 } : {}),
                ...(version >= 3 ? { stock_movements: [] } : {}),
                ...(version >= 6 ? { lines: [{ ...saleLine, weight_source: null }] } : {}),
                ...(version >= 7
                  ? { lines: [{ ...saleLine, weight_source: null, manual_adjustment: null }] }
                  : {}),
                payments: [version === 1 ? salePayment : payment],
              },
            }),
          ),
        );

        expect(decoded).toMatchObject({
          fact: {
            sale: {
              saleDiscount: null,
              saleDiscountAmount: 0,
              lines: [{ saleDiscountShare: 0 }],
            },
          },
        });
      },
    );

    it.each([1, 2, 3])(
      "reads a version %s cancelled sale as having no discount on its total",
      (version) => {
        const lines =
          version === 1
            ? [saleLine]
            : [
                {
                  ...saleLine,
                  weight_source: null,
                  ...(version === 3 ? { manual_adjustment: null } : {}),
                },
              ];

        const decoded = upcaster.decode(
          unappliedEventOf(
            pushed({
              event_type: "sale_cancelled",
              schema_version: version,
              payload: {
                ...saleFields,
                lines,
                authorized_by: null,
                payments: [payment],
                refunds: [refund],
              },
            }),
          ),
        );

        expect(decoded).toMatchObject({
          fact: {
            sale: { saleDiscount: null, saleDiscountAmount: 0, lines: [{ saleDiscountShare: 0 }] },
          },
        });
      },
    );
  });

  it("reads the print state of a sale's receipt", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          event_type: "sale_print_state_changed",
          schema_version: 1,
          payload: {
            sale_id: SALE,
            print_attempted_at: "2026-10-06T11:21:00.000Z",
            printed_at: "2026-10-06T11:21:05.000Z",
          },
        }),
      ),
    );

    expect(decoded).toEqual({
      kind: "fact",
      fact: {
        kind: "sale_print_state_changed",
        printState: {
          saleId: SALE,
          printAttemptedAt: new Date("2026-10-06T11:21:00.000Z"),
          printedAt: new Date("2026-10-06T11:21:05.000Z"),
        },
      },
    });
  });

  it("reads a receipt that was attempted and not printed as having no printing time", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          event_type: "sale_print_state_changed",
          schema_version: 1,
          payload: {
            sale_id: SALE,
            print_attempted_at: "2026-10-06T11:21:00.000Z",
            printed_at: null,
          },
        }),
      ),
    );

    expect(decoded).toMatchObject({ fact: { printState: { printedAt: null } } });
  });

  it("reads a retried copy of a receipt, with nobody authorizing it and no reason text", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          event_type: "reprint_recorded",
          schema_version: 1,
          occurred_at: "2026-10-06T11:30:00.000Z",
          payload: {
            sale_id: SALE,
            order_number: 1,
            requested_by: USER,
            authorized_by: null,
            reason_kind: "retry",
            reason_text: null,
          },
        }),
      ),
    );

    expect(decoded).toEqual({
      kind: "fact",
      fact: {
        kind: "reprint_recorded",
        reprint: {
          saleId: SALE,
          orderNumber: 1,
          requestedBy: USER,
          authorizedBy: null,
          reason: { kind: "retry" },
          occurredAt: new Date("2026-10-06T11:30:00.000Z"),
        },
      },
    });
  });

  it("reads a copy somebody asked for with its reason and the person who authorized it", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          event_type: "reprint_recorded",
          schema_version: 1,
          occurred_at: "2026-10-06T11:31:00.000Z",
          payload: {
            sale_id: SALE,
            order_number: 2,
            requested_by: USER,
            authorized_by: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
            reason_kind: "requested",
            reason_text: "El cliente la perdio",
          },
        }),
      ),
    );

    expect(decoded).toMatchObject({
      fact: {
        reprint: {
          orderNumber: 2,
          authorizedBy: "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13",
          reason: { kind: "requested", text: "El cliente la perdio" },
          occurredAt: new Date("2026-10-06T11:31:00.000Z"),
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
          saleDiscount: null,
          saleDiscountAmount: 0,
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

  it("reads the replacement of a pending QR payment", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          event_type: "qr_payment_replaced",
          schema_version: 1,
          payload: { payment_transaction_id: "transaction-1", sale_id: SALE },
        }),
      ),
    );

    expect(decoded).toEqual({
      kind: "fact",
      fact: {
        kind: "qr_payment_replaced",
        replacement: { paymentTransactionId: "transaction-1", saleId: SALE },
      },
    });
  });

  it("reads an opening count as the line counted, at the moment and by the person the event says", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          aggregate_type: "StockMovement",
          aggregate_id: "6d1f7c3a-5b2e-4f8a-9c4d-1e2f3a4b5c6d",
          event_type: "opening_count_recorded",
          schema_version: 1,
          payload: {
            movement_id: "6d1f7c3a-5b2e-4f8a-9c4d-1e2f3a4b5c6d",
            product_id: "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06",
            counted: 6000,
            expires_on: "2027-01-31",
          },
        }),
      ),
    );

    expect(decoded).toEqual({
      kind: "fact",
      fact: {
        kind: "opening_count_recorded",
        count: {
          movementId: "6d1f7c3a-5b2e-4f8a-9c4d-1e2f3a4b5c6d",
          productId: "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06",
          counted: 6000,
          expiresOn: "2027-01-31",
          countedAt: new Date("2026-10-06T11:20:00.000Z"),
          actorId: USER,
        },
      },
    });
  });

  it("reads the withdrawal of an opening count with the movement it takes back", () => {
    const decoded = upcaster.decode(
      unappliedEventOf(
        pushed({
          aggregate_type: "StockMovement",
          aggregate_id: "7e2a8d4b-6c3f-4a9b-8d5e-2f3a4b5c6d7e",
          event_type: "opening_count_withdrawn",
          schema_version: 1,
          payload: {
            movement_id: "7e2a8d4b-6c3f-4a9b-8d5e-2f3a4b5c6d7e",
            withdrawn_movement_id: "6d1f7c3a-5b2e-4f8a-9c4d-1e2f3a4b5c6d",
          },
        }),
      ),
    );

    expect(decoded).toEqual({
      kind: "fact",
      fact: {
        kind: "opening_count_withdrawn",
        withdrawal: {
          movementId: "7e2a8d4b-6c3f-4a9b-8d5e-2f3a4b5c6d7e",
          withdrawnMovementId: "6d1f7c3a-5b2e-4f8a-9c4d-1e2f3a4b5c6d",
          withdrawnAt: new Date("2026-10-06T11:20:00.000Z"),
          actorId: USER,
        },
      },
    });
  });

  it("cannot read an event type and version no schema describes", () => {
    const decoded = upcaster.decode(unappliedEventOf(pushed({ schema_version: 9 })));

    expect(decoded).toEqual({
      kind: "unreadable",
      reason: "no schema reads sale_completed version 9",
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

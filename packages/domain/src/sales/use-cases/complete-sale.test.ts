import { describe, expect, it } from "vitest";
import { decideSaleAuthorization } from "../../fiscal/use-cases/decide-sale-authorization.js";
import {
  FakeSaleAuthorizationTransaction,
  SequentialIds,
} from "../../fiscal/use-cases/test-support/fake-sale-authorization.js";
import { ScriptedShortCodes } from "../../fiscal/use-cases/test-support/scripted-short-codes.js";
import type { SaleWithLines } from "../model/sale.js";
import { completeSale } from "./complete-sale.js";
import { FakeSaleLedger } from "./test-support/fake-sale-ledger.js";

const COMPLETED_AT = new Date("2026-10-02T02:30:00.000Z");
const SALE: SaleWithLines = {
  id: "sale-1",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  saleDiscount: null,
  lines: [],
};

describe("completeSale", () => {
  it("records the deferred sale before the gate failure that deferred it", () => {
    const ledger = new FakeSaleLedger({ sales: [SALE], issuerIdentifications: [] });

    ledger.transaction((tx) =>
      completeSale(
        {
          ...tx,
          decideSaleAuthorization: ({ ids, saleId, gate, decidedAt, occurredAt, total }) => {
            const authorization = new FakeSaleAuthorizationTransaction({
              online: { lastHealthCheckOkAt: COMPLETED_AT, tokenValid: true, arcaReachable: true },
              series: {
                pointOfSale: 12,
                localLastAuthorized: 40,
                taxAuthorityLastAuthorized: 40,
                documentRequesting: false,
                documentUnknown: false,
                numberingFrozen: false,
                clockMark: null,
                taxAuthorityLastIssuedOn: null,
              },
              offlineSeries: {
                pointOfSale: null,
                blocksInAssignmentOrder: [],
                localLastUsed: null,
                taxAuthorityLastAuthorized: null,
                highestSyncedNumber: null,
                clockMark: null,
              },
              heldCodes: [],
              origin: { registerId: SALE.registerId, actorId: SALE.actorId },
              takenShortCodes: [],
            });
            decideSaleAuthorization(authorization, ids, new ScriptedShortCodes(["7KQ4M2P9"]), {
              saleId,
              gate,
              decidedAt,
              occurredAt,
              total,
            });
            for (const event of authorization.outbox) {
              tx.appendOutboxEvent(event);
            }
          },
        },
        new SequentialIds(),
        {
          sale: SALE,
          total: 5_900,
          payments: [],
          movements: [],
          actorId: "cashier",
          completedAt: COMPLETED_AT,
        },
      ),
    );

    expect(ledger.state.outbox.map(({ event_type }) => event_type)).toEqual([
      "sale_completed",
      "deferred_sale_recorded",
      "fiscal_gate_failed",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import type { IssuerIdentificationInEffect } from "../model/pre-emission-gate.js";
import { evaluatePreEmissionGate } from "./evaluate-pre-emission-gate.js";
import {
  FakeFiscalGateLedger,
  type FakeFiscalGateLedgerState,
  FixedClock,
  SequentialIds,
} from "./test-support/fake-fiscal-gate-ledger.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const SALE = {
  id: "sale-1",
  registerId: "register-1",
  actorId: "cashier",
  lines: [{ lineTotal: 5000 }, { lineTotal: 900 }],
};
const ISSUER: IssuerIdentificationInEffect = {
  legalName: "Comercio de Prueba",
  grossIncomeRegistration: "901-000000-0",
  activityStartDate: "2020-01-15",
  authorizedCuit: "20000000000",
  taxStatus: "Condicion de prueba",
  version: 2,
};
const BUYER_TAX_STATUSES = [
  { code: 90, description: "Consumidor Final", invoiceClass: "A/M/C" },
  { code: 91, description: "Condicion de prueba", invoiceClass: "C" },
];
const READY: Partial<FakeFiscalGateLedgerState> = {
  completedSales: [SALE],
  issuerIdentifications: [ISSUER],
  buyerTaxStatusSets: [{ paramsVersion: 1, options: BUYER_TAX_STATUSES }],
};

function evaluate(ledger: FakeFiscalGateLedger, saleId = "sale-1") {
  return evaluatePreEmissionGate(
    { ledger, clock: new FixedClock(NOW), ids: new SequentialIds() },
    { saleId },
  );
}

describe("evaluatePreEmissionGate", () => {
  it("composes the factura C of a completed sale and records it with the sale", () => {
    const ledger = new FakeFiscalGateLedger(READY);

    const outcome = evaluate(ledger);

    expect(outcome).toMatchObject({
      kind: "passed",
      document: {
        total: 5900,
        netAmount: 5900,
        vatAmount: 0,
        issuer: { version: 2, cuit: "20000000000" },
        buyerTaxStatusCode: 90,
      },
    });
    expect(ledger.state.recorded).toStrictEqual([{ saleId: "sale-1", evaluatedAt: NOW, outcome }]);
    expect(ledger.state.outbox).toStrictEqual([]);
  });

  it("records a failure and appends fiscal_gate_failed in the same transaction", () => {
    const ledger = new FakeFiscalGateLedger({ ...READY, issuerIdentifications: [] });

    const outcome = evaluate(ledger);

    expect(outcome).toStrictEqual({ kind: "failed", reason: "issuer_identification_missing" });
    expect(ledger.transactions).toBe(1);
    expect(ledger.state.recorded).toStrictEqual([{ saleId: "sale-1", evaluatedAt: NOW, outcome }]);
    expect(ledger.state.outbox).toStrictEqual([
      {
        event_id: "id-1",
        aggregate_type: "Sale",
        aggregate_id: "sale-1",
        event_type: "fiscal_gate_failed",
        schema_version: 1,
        payload: {
          sale_id: "sale-1",
          register_id: "register-1",
          reason: "issuer_identification_missing",
          evaluated_at: "2026-10-01T12:00:00.000Z",
        },
        occurred_at: "2026-10-01T12:00:00.000Z",
        actor_id: "cashier",
      },
    ]);
  });

  it("evaluates with the issuer identification and buyer tax-status set in effect", () => {
    const ledger = new FakeFiscalGateLedger({
      ...READY,
      issuerIdentifications: [{ ...ISSUER, version: 3, legalName: null }, ISSUER],
      buyerTaxStatusSets: [
        { paramsVersion: 1, options: BUYER_TAX_STATUSES },
        {
          paramsVersion: 2,
          options: [{ code: 5, description: "Consumidor Final", invoiceClass: "C" }],
        },
      ],
    });

    expect(evaluate(ledger)).toStrictEqual({ kind: "failed", reason: "legal_name_missing" });

    ledger.state.issuerIdentifications = [ISSUER];
    ledger.state.recorded = [];
    expect(evaluate(ledger)).toMatchObject({
      kind: "passed",
      document: { buyerTaxStatusCode: 5 },
    });
  });

  it("answers the recorded outcome again without evaluating or recording anything", () => {
    const ledger = new FakeFiscalGateLedger(READY);
    const first = evaluate(ledger);

    ledger.state.issuerIdentifications = [];
    const second = evaluate(ledger);

    expect(second).toStrictEqual(first);
    expect(ledger.state.recorded).toHaveLength(1);
    expect(ledger.state.outbox).toStrictEqual([]);
  });

  it("does not repeat the failure event when a failed evaluation is asked again", () => {
    const ledger = new FakeFiscalGateLedger({ ...READY, issuerIdentifications: [] });
    evaluate(ledger);

    expect(evaluate(ledger)).toStrictEqual({
      kind: "failed",
      reason: "issuer_identification_missing",
    });
    expect(ledger.state.outbox).toHaveLength(1);
  });

  it("answers that the sale is not completed, recording nothing, for a sale that is not", () => {
    const ledger = new FakeFiscalGateLedger(READY);

    expect(evaluate(ledger, "other-sale")).toStrictEqual({ kind: "sale_not_completed" });
    expect(ledger.state.recorded).toStrictEqual([]);
    expect(ledger.state.outbox).toStrictEqual([]);
  });

  it.each(["recordPreEmissionGate", "appendOutboxEvent"] as const)(
    "leaves nothing behind when %s fails",
    (failOn) => {
      const ledger = new FakeFiscalGateLedger({ ...READY, issuerIdentifications: [] });
      ledger.failOn = failOn;

      expect(() => evaluate(ledger)).toThrow(`${failOn} failed`);
      expect(ledger.state.recorded).toStrictEqual([]);
      expect(ledger.state.outbox).toStrictEqual([]);
    },
  );
});

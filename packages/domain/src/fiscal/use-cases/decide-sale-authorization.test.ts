import { describe, expect, it } from "vitest";
import type { FiscalOnlineSignalEvidence } from "../model/fiscal-online-signal.js";
import type { FacturaC, PreEmissionGateOutcome } from "../model/pre-emission-gate.js";
import type { RealTimeSeries } from "../model/real-time-authorization.js";
import { decideSaleAuthorization } from "./decide-sale-authorization.js";
import {
  FakeSaleAuthorizationTransaction,
  SequentialIds,
} from "./test-support/fake-sale-authorization.js";

const DECIDED_AT = new Date("2026-10-02T02:30:00.000Z");
const SALE_ID = "sale-1";

const DOCUMENT: FacturaC = {
  invoiceClass: "C",
  total: 12_500,
  netAmount: 12_500,
  vatAmount: 0,
  issuer: {
    legalName: "Comercio de Prueba SA",
    cuit: "20000000001",
    taxStatus: "MONOTRIBUTO",
    grossIncomeRegistration: "901-123456-7",
    activityStartDate: "2020-01-01",
    version: 3,
  },
  buyerTaxStatusCode: 5,
};

const ONLINE: FiscalOnlineSignalEvidence = {
  lastHealthCheckOkAt: new Date(DECIDED_AT.getTime() - 1_000),
  tokenValid: true,
  arcaReachable: true,
};
const SERIES: RealTimeSeries = {
  pointOfSale: 12,
  localLastAuthorized: 40,
  taxAuthorityLastAuthorized: 38,
  documentWaiting: false,
};
const PASSED: PreEmissionGateOutcome = { kind: "passed", document: DOCUMENT };

interface Changes {
  gate?: PreEmissionGateOutcome;
  online?: FiscalOnlineSignalEvidence;
  series?: Partial<RealTimeSeries>;
}

function decide({ gate = PASSED, online = ONLINE, series = {} }: Changes = {}) {
  const tx = new FakeSaleAuthorizationTransaction(online, { ...SERIES, ...series });
  const ids = new SequentialIds();
  const outcome = decideSaleAuthorization(tx, ids, {
    saleId: SALE_ID,
    gate,
    decidedAt: DECIDED_AT,
  });
  return { tx, ids, outcome };
}

describe("decideSaleAuthorization", () => {
  it("reserves the next number of the point of sale for the sale and reports the document", () => {
    const { tx, outcome } = decide();

    expect(outcome).toEqual({ kind: "reserved", fiscalDocumentId: "fiscal-document-1" });
    expect(tx.reservations).toEqual([
      {
        id: "fiscal-document-1",
        saleId: SALE_ID,
        pointOfSale: 12,
        number: 41,
        issuedOn: "2026-10-01",
        document: DOCUMENT,
        reservedAt: DECIDED_AT,
      },
    ]);
    expect(tx.routings).toEqual([]);
  });

  it.each([
    [
      "the pre-emission gate failed",
      { gate: { kind: "failed", reason: "legal_name_missing" } },
      "pre_emission_gate_failed",
    ],
    [
      "the register is not fiscally online",
      { online: { ...ONLINE, arcaReachable: false } },
      "fiscally_offline",
    ],
    [
      "the register has no point of sale",
      { series: { pointOfSale: null } },
      "point_of_sale_missing",
    ],
    ["a document is waiting", { series: { documentWaiting: true } }, "document_waiting"],
    [
      "the tax authority's count is unknown",
      { series: { taxAuthorityLastAuthorized: null } },
      "tax_authority_count_unknown",
    ],
  ] satisfies [string, Changes, string][])(
    "routes the sale to the deferred flow, reserving nothing, when %s",
    (_case, changes, reason) => {
      const { tx, ids, outcome } = decide(changes);

      expect(outcome).toEqual({ kind: "deferred", reason });
      expect(tx.routings).toEqual([{ saleId: SALE_ID, reason, routedAt: DECIDED_AT }]);
      expect(tx.reservations).toEqual([]);
      expect(ids.issued).toBe(0);
    },
  );
});

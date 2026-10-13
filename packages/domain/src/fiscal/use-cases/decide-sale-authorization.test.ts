import { describe, expect, it } from "vitest";
import type { FiscalOnlineSignalEvidence } from "../model/fiscal-online-signal.js";
import type { FacturaC, PreEmissionGateOutcome } from "../model/pre-emission-gate.js";
import type { RealTimeSeries } from "../model/real-time-authorization.js";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../test-support/fictional-tax-identities.js";
import { decideSaleAuthorization } from "./decide-sale-authorization.js";
import {
  FakeSaleAuthorizationTransaction,
  SequentialIds,
} from "./test-support/fake-sale-authorization.js";
import { ScriptedShortCodes } from "./test-support/scripted-short-codes.js";

const DECIDED_AT = new Date("2026-10-02T02:30:00.000Z");
const OCCURRED_AT = new Date("2026-10-02T02:29:58.000Z");
const SALE_ID = "sale-1";
const SALE_TOTAL = 12_500;
const SHORT_CODES = ["7KQ4M2P9", "R3XW8H5N"];

const DOCUMENT: FacturaC = {
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
  takenShortCodes?: string[];
}

function decide({
  gate = PASSED,
  online = ONLINE,
  series = {},
  takenShortCodes = [],
}: Changes = {}) {
  const tx = new FakeSaleAuthorizationTransaction(
    online,
    { ...SERIES, ...series },
    takenShortCodes,
  );
  const ids = new SequentialIds();
  const shortCodes = new ScriptedShortCodes(SHORT_CODES);
  const outcome = decideSaleAuthorization(tx, ids, shortCodes, {
    saleId: SALE_ID,
    gate,
    decidedAt: DECIDED_AT,
    occurredAt: OCCURRED_AT,
    total: SALE_TOTAL,
  });
  return { tx, ids, outcome };
}

describe("decideSaleAuthorization", () => {
  it("reserves the next number of the point of sale for the sale and reports the document", () => {
    const { tx, ids, outcome } = decide();

    expect(outcome).toEqual({ kind: "reserved", fiscalDocumentId: "id-1" });
    expect(tx.reservations).toEqual([
      {
        id: "id-1",
        saleId: SALE_ID,
        pointOfSale: 12,
        number: 41,
        issuedOn: "2026-10-01",
        document: DOCUMENT,
        reservedAt: DECIDED_AT,
      },
    ]);
    expect(tx.routings).toEqual([]);
    expect(tx.routingAttempts).toEqual([]);
    expect(ids.issued).toBe(1);
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
      expect(tx.routings).toEqual([
        {
          id: "id-1",
          saleId: SALE_ID,
          occurredAt: OCCURRED_AT,
          total: SALE_TOTAL,
          reason,
          shortCode: "7KQ4M2P9",
          routedAt: DECIDED_AT,
        },
      ]);
      expect(tx.reservations).toEqual([]);
      expect(ids.issued).toBe(1);
    },
  );

  it("draws another short code for the record when the first is already taken", () => {
    const { tx, outcome } = decide({
      series: { pointOfSale: null },
      takenShortCodes: ["7KQ4M2P9"],
    });

    expect(outcome).toEqual({ kind: "deferred", reason: "point_of_sale_missing" });
    expect(tx.routingAttempts.map(({ id, shortCode }) => [id, shortCode])).toEqual([
      ["id-1", "7KQ4M2P9"],
      ["id-1", "R3XW8H5N"],
    ]);
    expect(tx.routings.map(({ shortCode }) => shortCode)).toEqual(["R3XW8H5N"]);
  });
});

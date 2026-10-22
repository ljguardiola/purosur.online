import { describe, expect, it } from "vitest";
import type { FiscalOnlineSignalEvidence } from "../model/fiscal-online-signal.js";
import type { FacturaC, PreEmissionGateOutcome } from "../model/pre-emission-gate.js";
import type { OfflineSeries, RealTimeSeries } from "../model/real-time-authorization.js";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../test-support/fictional-tax-identities.js";
import { decideSaleAuthorization } from "./decide-sale-authorization.js";
import {
  type FakeSaleAuthorizationState,
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
  documentRequesting: false,
  documentUnknown: false,
  numberingFrozen: false,
  clockMark: null,
  taxAuthorityLastIssuedOn: null,
  clockCorrections: [],
};
const OFFLINE_SERIES: OfflineSeries = {
  pointOfSale: 7,
  blocksInAssignmentOrder: [{ firstNumber: 101, lastNumber: 1100 }],
  localLastUsed: 120,
  taxAuthorityLastAuthorized: 100,
  highestSyncedNumber: null,
  clockMark: null,
};
const FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };
const FIRST_HALF_CODE = "71234567890123";
const SECOND_HALF_CODE = "71234567899999";
const ORIGIN = { registerId: "register-1", actorId: "cashier" };
const PASSED: PreEmissionGateOutcome = { kind: "passed", document: DOCUMENT };

interface Changes extends Partial<FakeSaleAuthorizationState> {
  gate?: PreEmissionGateOutcome;
  occurredAt?: Date;
  decidedAt?: Date;
}

function decide({
  gate = PASSED,
  occurredAt = OCCURRED_AT,
  decidedAt = DECIDED_AT,
  ...state
}: Changes = {}) {
  const tx = new FakeSaleAuthorizationTransaction({
    online: ONLINE,
    series: SERIES,
    offlineSeries: OFFLINE_SERIES,
    heldCodes: [{ fortnight: FIRST_HALF, code: FIRST_HALF_CODE }],
    origin: ORIGIN,
    takenShortCodes: [],
    ...state,
  });
  const ids = new SequentialIds();
  const shortCodes = new ScriptedShortCodes(SHORT_CODES);
  const outcome = decideSaleAuthorization(tx, ids, shortCodes, {
    saleId: SALE_ID,
    gate,
    decidedAt,
    occurredAt,
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
    expect(tx.offlineDocuments).toEqual([]);
    expect(tx.outbox).toEqual([]);
    expect(ids.issued).toBe(1);
  });

  it("raises the clock mark of the reserved series to the moment of the decision", () => {
    const { tx } = decide();

    expect(tx.recordedClockMarks).toEqual([
      { pointOfSale: 12, documentType: "factura_c", reading: DECIDED_AT },
    ]);
  });

  it("raises the clock mark of the offline series, not the real-time one, to the time of the sale when it issues offline", () => {
    const { tx } = decide({ online: { ...ONLINE, arcaReachable: false } });

    expect(tx.recordedClockMarks).toEqual([
      { pointOfSale: 7, documentType: "factura_c", reading: OCCURRED_AT },
    ]);
  });

  it("keeps the reserved series' mark when the decision is behind it within the tolerance", () => {
    const mark = new Date(DECIDED_AT.getTime() + 30_000);
    const { tx, outcome } = decide({ series: { ...SERIES, clockMark: mark } });

    expect(outcome).toMatchObject({ kind: "reserved" });
    expect(tx.recordedClockMarks).toEqual([
      { pointOfSale: 12, documentType: "factura_c", reading: mark },
    ]);
  });

  it("keeps the offline series' mark when the sale is behind it within the tolerance", () => {
    const mark = new Date(OCCURRED_AT.getTime() + 30_000);
    const { tx } = decide({
      online: { ...ONLINE, arcaReachable: false },
      offlineSeries: { ...OFFLINE_SERIES, clockMark: mark },
    });

    expect(tx.recordedClockMarks).toEqual([
      { pointOfSale: 7, documentType: "factura_c", reading: mark },
    ]);
  });

  it("reserves nothing and raises no mark for a sale routed to the deferred flow", () => {
    const { tx } = decide({ series: { ...SERIES, pointOfSale: null } });

    expect(tx.recordedClockMarks).toEqual([]);
  });

  it.each([
    [
      "the pre-emission gate failed",
      { gate: { kind: "failed", reason: "legal_name_missing" } },
      "pre_emission_gate_failed",
    ],
    [
      "the register has no point of sale",
      { series: { ...SERIES, pointOfSale: null } },
      "point_of_sale_missing",
    ],
    [
      "a document is waiting for its answer",
      { series: { ...SERIES, documentRequesting: true } },
      "document_waiting",
    ],
    [
      "the tax authority's count is unknown",
      { series: { ...SERIES, taxAuthorityLastAuthorized: null } },
      "tax_authority_count_unknown",
    ],
    [
      "the register is offline and holds no code for the sale's date",
      { online: { ...ONLINE, arcaReachable: false }, heldCodes: [] },
      "fiscally_offline",
    ],
    [
      "the register's clock is behind its own mark, even with a code at hand for the sale's date",
      { series: { ...SERIES, clockMark: new Date(DECIDED_AT.getTime() + 61_000) } },
      "clock_behind",
    ],
    [
      "the offline series' mark is more than a minute ahead of the sale while the register is offline",
      {
        online: { ...ONLINE, arcaReachable: false },
        offlineSeries: {
          ...OFFLINE_SERIES,
          clockMark: new Date(OCCURRED_AT.getTime() + 61_000),
        },
      },
      "clock_behind",
    ],
    [
      "the real-time series is suspended and the offline block is exhausted",
      {
        series: { ...SERIES, documentUnknown: true },
        offlineSeries: { ...OFFLINE_SERIES, localLastUsed: 1100 },
      },
      "document_waiting",
    ],
  ] satisfies [string, Changes, string][])(
    "routes the sale to the deferred flow, numbering nothing, when %s",
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
      expect(tx.offlineDocuments).toEqual([]);
      expect(tx.outbox).toEqual([
        {
          event_id: "id-2",
          aggregate_type: "Sale",
          aggregate_id: SALE_ID,
          event_type: "deferred_sale_recorded",
          schema_version: 1,
          payload: {
            id: "id-1",
            sale_id: SALE_ID,
            register_id: ORIGIN.registerId,
            occurred_at: OCCURRED_AT.toISOString(),
            total: SALE_TOTAL,
            reason,
            short_code: "7KQ4M2P9",
            routed_at: DECIDED_AT.toISOString(),
          },
          occurred_at: DECIDED_AT.toISOString(),
          actor_id: ORIGIN.actorId,
        },
      ]);
      expect(tx.recordedClockMarks).toEqual([]);
      expect(ids.issued).toBe(2);
    },
  );

  describe("in the lapse after a clock correction", () => {
    const LAPSE = {
      series: {
        ...SERIES,
        taxAuthorityLastIssuedOn: "2026-10-03",
        clockCorrections: [
          {
            previousReading: new Date("2026-10-04T15:00:00.000Z"),
            correctedReading: new Date("2026-10-01T10:00:00.000Z"),
          },
        ],
      },
    };

    it("issues the sale under the offline code with the lapse as its cause, dated by the sale", () => {
      const { tx, outcome } = decide(LAPSE);

      expect(outcome).toEqual({
        kind: "issued_offline",
        fiscalDocumentId: "id-1",
        cause: "clock_correction_lapse",
      });
      expect(tx.offlineDocuments).toMatchObject([
        {
          pointOfSale: 7,
          number: 121,
          issuedOn: "2026-10-01",
          offlineAuthorizationCode: FIRST_HALF_CODE,
          cause: "clock_correction_lapse",
        },
      ]);
      expect(tx.reservations).toEqual([]);
    });

    it("routes the sale to the deferred flow when the register holds no code for its date", () => {
      const { tx, outcome } = decide({ ...LAPSE, heldCodes: [] });

      expect(outcome).toEqual({ kind: "deferred", reason: "clock_behind" });
      expect(tx.offlineDocuments).toEqual([]);
      expect(tx.reservations).toEqual([]);
    });

    it("reserves the next number once the decision's day reaches the tax authority's day", () => {
      const decidedAt = new Date("2026-10-03T03:00:00.000Z");
      const { outcome } = decide({
        ...LAPSE,
        decidedAt,
        online: { ...ONLINE, lastHealthCheckOkAt: new Date(decidedAt.getTime() - 1_000) },
      });

      expect(outcome).toEqual({ kind: "reserved", fiscalDocumentId: "id-1" });
    });
  });

  describe("issuing under the pre-obtained code", () => {
    const OFFLINE = { online: { ...ONLINE, arcaReachable: false } };

    it("issues the next number of the offline block, recording that the register was not online", () => {
      const { tx, outcome } = decide(OFFLINE);

      expect(outcome).toEqual({
        kind: "issued_offline",
        fiscalDocumentId: "id-1",
        cause: "no_connectivity",
      });
      expect(tx.offlineDocuments).toEqual([
        {
          id: "id-1",
          saleId: SALE_ID,
          pointOfSale: 7,
          documentType: "factura_c",
          number: 121,
          issuedOn: "2026-10-01",
          generatedAt: DECIDED_AT,
          generationStamp: "20261001233000",
          offlineAuthorizationCode: FIRST_HALF_CODE,
          fortnight: FIRST_HALF,
          document: DOCUMENT,
          buyerDocumentType: 99,
          buyerDocumentNumber: 0,
          cause: "no_connectivity",
        },
      ]);
      expect(tx.reservations).toEqual([]);
      expect(tx.routings).toEqual([]);
    });

    it("issues under the code while connectivity, token and tax authority work, when the series is suspended by an unclear outcome", () => {
      const { tx, outcome } = decide({ series: { ...SERIES, documentUnknown: true } });

      expect(outcome).toEqual({
        kind: "issued_offline",
        fiscalDocumentId: "id-1",
        cause: "unclear_outcome",
      });
      expect(tx.offlineDocuments).toMatchObject([{ cause: "unclear_outcome", number: 121 }]);
    });

    it("sends the document to the cloud in the same transaction, with its cause and generation stamp", () => {
      const { tx, ids } = decide(OFFLINE);

      expect(tx.outbox).toEqual([
        {
          event_id: "id-2",
          aggregate_type: "Sale",
          aggregate_id: SALE_ID,
          event_type: "offline_fiscal_document_issued",
          schema_version: 2,
          payload: expect.objectContaining({
            document: expect.objectContaining({ invoice_class: "C" }),
            fiscal_document_id: "id-1",
            register_id: "register-1",
            number: 121,
            generation_stamp: "20261001233000",
            offline_authorization_code: FIRST_HALF_CODE,
            cause: "no_connectivity",
          }),
          occurred_at: DECIDED_AT.toISOString(),
          actor_id: "cashier",
        },
      ]);
      expect(ids.issued).toBe(2);
    });

    it("uses the code of the fortnight containing the sale's own date even when decided in the next one", () => {
      const { tx, outcome } = decide({
        ...OFFLINE,
        occurredAt: new Date("2026-10-16T02:59:59.000Z"),
        decidedAt: new Date("2026-10-16T03:00:01.000Z"),
        online: { ...ONLINE, lastHealthCheckOkAt: null },
        heldCodes: [
          { fortnight: SECOND_HALF, code: SECOND_HALF_CODE },
          { fortnight: FIRST_HALF, code: FIRST_HALF_CODE },
        ],
      });

      expect(outcome).toMatchObject({ kind: "issued_offline" });
      expect(tx.offlineDocuments).toMatchObject([
        {
          issuedOn: "2026-10-15",
          offlineAuthorizationCode: FIRST_HALF_CODE,
          fortnight: FIRST_HALF,
          generationStamp: "20261016000001",
        },
      ]);
      expect(tx.codeLookups).toEqual([FIRST_HALF]);
    });

    it("reads the code of the sale's fortnight in the transaction instead of relying on a current one", () => {
      const { tx } = decide({
        ...OFFLINE,
        heldCodes: [{ fortnight: SECOND_HALF, code: SECOND_HALF_CODE }],
      });

      expect(tx.codeLookups).toEqual([FIRST_HALF]);
      expect(tx.offlineDocuments).toEqual([]);
    });

    it("never issues under the code for a sale whose gate failed", () => {
      const { tx, outcome } = decide({
        ...OFFLINE,
        gate: { kind: "failed", reason: "legal_name_missing" },
      });

      expect(outcome).toEqual({ kind: "deferred", reason: "pre_emission_gate_failed" });
      expect(tx.offlineDocuments).toEqual([]);
      expect(tx.outbox.map(({ event_type }) => event_type)).toEqual(["deferred_sale_recorded"]);
    });
  });

  it("draws another short code for the record when the first is already taken, appending one event", () => {
    const { tx, ids, outcome } = decide({
      series: { ...SERIES, pointOfSale: null },
      takenShortCodes: ["7KQ4M2P9"],
    });

    expect(outcome).toEqual({ kind: "deferred", reason: "point_of_sale_missing" });
    expect(tx.routingAttempts.map(({ id, shortCode }) => [id, shortCode])).toEqual([
      ["id-1", "7KQ4M2P9"],
      ["id-1", "R3XW8H5N"],
    ]);
    expect(tx.routings.map(({ shortCode }) => shortCode)).toEqual(["R3XW8H5N"]);
    expect(tx.outbox).toMatchObject([
      {
        event_id: "id-2",
        event_type: "deferred_sale_recorded",
        payload: { id: "id-1", short_code: "R3XW8H5N" },
      },
    ]);
    expect(ids.issued).toBe(2);
  });
});

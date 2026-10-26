import { describe, expect, it } from "vitest";
import { DEFERRED_BACKLOG_RETRY_INTERVAL_MS } from "../model/deferred-backlog.js";
import { deferredSaleSatisfiedEvent } from "../model/deferred-sale-satisfied-event.js";
import { FACTURA_C_DOCUMENT_TYPE } from "../model/fiscal-rejection-standing.js";
import type { FacturaC } from "../model/pre-emission-gate.js";
import type { RealTimeAuthorizationAnswer } from "../model/real-time-authorization.js";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../test-support/fictional-tax-identities.js";
import { catchUpDeferredSales } from "./catch-up-deferred-sales.js";
import {
  AUTHORIZED,
  deferredCatchUpRig,
  FIRST,
  NOW,
  ORIGIN,
  REJECTED,
  SECOND,
  sale,
  state,
  THIRD,
} from "./test-support/deferred-catch-up-rig.js";
import type { FakeDeferredSaleCatchUpState } from "./test-support/fake-deferred-sale-catch-up.js";

const HELD_RESERVED_AT = new Date("2026-10-01T14:00:05.000Z");
const HELD_INVOICE: FacturaC = {
  invoiceClass: "C",
  total: 1_000,
  netAmount: 1_000,
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

function catchUp(
  overrides: Partial<FakeDeferredSaleCatchUpState> = {},
  answers: readonly RealTimeAuthorizationAnswer[] = [AUTHORIZED],
) {
  const { register, taxAuthority, ports } = deferredCatchUpRig(overrides, answers);
  return { register, taxAuthority, outcome: catchUpDeferredSales(ports) };
}

describe("catching up the deferred sales", () => {
  it("invoices the backlog one sale at a time in strict date order, whatever order it is held in", async () => {
    const { register, outcome } = catchUp({ backlog: [THIRD, FIRST, SECOND] });

    expect(await outcome).toEqual({
      kind: "completed",
      invoiced: ["sale-1", "sale-2", "sale-3"],
    });
    expect(register.reservations.map(({ saleId }) => saleId)).toEqual([
      "sale-1",
      "sale-2",
      "sale-3",
    ]);
  });

  it("numbers each invoice after the tax authority's last authorized voucher and the previous one", async () => {
    const { register, outcome } = catchUp();
    await outcome;

    expect(register.reservations.map(({ pointOfSale, number }) => [pointOfSale, number])).toEqual([
      [12, 101],
      [12, 102],
      [12, 103],
    ]);
  });

  it("numbers after the register's own authorized documents when they are ahead of the tax authority", async () => {
    const { register, outcome } = catchUp({
      series: { ...state().series, localLastAuthorized: 130 },
    });
    await outcome;

    expect(register.reservations.map(({ number }) => number)).toEqual([131, 132, 133]);
  });

  it("dates each invoice with its sale's own day, never the day it is processed", async () => {
    const { register, outcome } = catchUp();
    await outcome;

    expect(register.reservations.map(({ issuedOn }) => issuedOn)).toEqual([
      "2026-10-01",
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("reserves each document at the moment it does, rebuilt from the sale's total and the issuer in effect", async () => {
    const { register, outcome } = catchUp({
      backlog: [sale("sale-1", "2026-10-01T14:00:00.000Z", { total: 4_321 })],
    });
    await outcome;

    expect(register.reservations).toEqual([
      {
        id: "id-1",
        saleId: "sale-1",
        pointOfSale: 12,
        number: 101,
        issuedOn: "2026-10-01",
        reservedAt: NOW,
        document: {
          invoiceClass: "C",
          total: 4_321,
          netAmount: 4_321,
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
        },
      },
    ]);
  });

  it("raises the register's clock mark to the moment it reserves", async () => {
    const { register, outcome } = catchUp({
      backlog: [FIRST],
      series: { ...state().series, clockMark: new Date("2026-10-03T14:00:00.000Z") },
    });
    await outcome;

    expect(register.clockMarks).toEqual([
      { pointOfSale: 12, documentType: FACTURA_C_DOCUMENT_TYPE, reading: NOW },
    ]);
  });

  it("asks the tax authority for each document it reserved, for its own sale", async () => {
    const { taxAuthority, outcome } = catchUp();
    await outcome;

    expect(taxAuthority.calls.map(({ saleId, number }) => [saleId, number])).toEqual([
      ["sale-1", 101],
      ["sale-2", 102],
      ["sale-3", 103],
    ]);
  });

  it("completes without reserving anything when the backlog is empty", async () => {
    const { register, outcome } = catchUp({ backlog: [] });

    expect(await outcome).toEqual({ kind: "completed", invoiced: [] });
    expect(register.reservations).toEqual([]);
  });

  it("never reserves a sale whose window ran out", async () => {
    const expired = sale("sale-0", "2026-09-27T14:00:00.000Z");
    const { register, outcome } = catchUp({ backlog: [expired, FIRST] });

    expect(await outcome).toEqual({ kind: "completed", invoiced: ["sale-1"] });
    expect(register.reservations.map(({ saleId }) => saleId)).toEqual(["sale-1"]);
  });

  it("never reserves a sale dated before the last authorized document", async () => {
    const { register, outcome } = catchUp({
      series: { ...state().series, taxAuthorityLastIssuedOn: "2026-10-02" },
    });

    expect(await outcome).toEqual({ kind: "completed", invoiced: ["sale-3"] });
    expect(register.reservations.map(({ saleId }) => saleId)).toEqual(["sale-3"]);
  });

  it("drops a sale waiting to be retried once the series reached a later day, and invoices the next one", async () => {
    const attemptEndedAt = new Date(NOW.getTime() - 60_000);
    const { register, outcome } = catchUp({
      series: { ...state().series, taxAuthorityLastIssuedOn: "2026-10-02" },
      backlog: [
        sale("sale-1", "2026-10-01T14:00:00.000Z", { lastAttemptEndedAt: attemptEndedAt }),
        THIRD,
      ],
    });

    expect(await outcome).toEqual({ kind: "completed", invoiced: ["sale-3"] });
    expect(register.reservations.map(({ saleId }) => saleId)).toEqual(["sale-3"]);
  });

  describe("stops, reserving nothing, when", () => {
    it.each([
      [
        "a fiscal document waits for the tax authority's answer",
        { series: { ...state().series, documentRequesting: true } },
        { kind: "document_waiting" },
      ],
      [
        "a fiscal document is missing the tax authority's answer",
        { series: { ...state().series, documentUnknown: true } },
        { kind: "document_waiting" },
      ],
      [
        "the register has no point of sale",
        { series: { ...state().series, pointOfSale: null } },
        { kind: "point_of_sale_missing" },
      ],
      [
        "its numbering is frozen",
        { series: { ...state().series, numberingFrozen: true } },
        { kind: "numbering_frozen" },
      ],
      [
        "its clock reads behind its mark",
        { series: { ...state().series, clockMark: new Date("2026-10-03T16:00:00.000Z") } },
        { kind: "clock_behind" },
      ],
      [
        "the register is not fiscally online",
        {
          online: { lastHealthCheckOkAt: null, tokenValid: true, arcaReachable: true },
        },
        { kind: "fiscally_offline" },
      ],
      [
        "a restored register still awaits its numbering",
        { awaitingRestoredNumbering: true },
        { kind: "awaiting_restored_numbering" },
      ],
      [
        "the tax authority's last authorized number is unknown",
        { series: { ...state().series, taxAuthorityLastAuthorized: null } },
        { kind: "tax_authority_count_unknown" },
      ],
    ] satisfies [string, Partial<FakeDeferredSaleCatchUpState>, { kind: string }][])(
      "%s",
      async (_case, overrides, reason) => {
        const { register, taxAuthority, outcome } = catchUp(overrides);

        expect(await outcome).toEqual({ kind: "stopped", invoiced: [], reason });
        expect(register.reservations).toEqual([]);
        expect(taxAuthority.calls).toEqual([]);
      },
    );

    it("does not move past a sale whose document the pre-emission gate refuses", async () => {
      const { register, taxAuthority, outcome } = catchUp({ issuer: undefined });

      expect(await outcome).toEqual({
        kind: "stopped",
        invoiced: [],
        reason: { kind: "gate_failed", reason: "issuer_identification_missing" },
      });
      expect(register.reservations).toEqual([]);
      expect(taxAuthority.calls).toEqual([]);
    });

    it("waits for the retry interval of a sale whose last attempt ended", async () => {
      const attemptEndedAt = new Date(NOW.getTime() - DEFERRED_BACKLOG_RETRY_INTERVAL_MS + 1_000);
      const { register, outcome } = catchUp({
        backlog: [
          sale("sale-1", "2026-10-01T14:00:00.000Z", { lastAttemptEndedAt: attemptEndedAt }),
          SECOND,
        ],
      });

      expect(await outcome).toEqual({
        kind: "stopped",
        invoiced: [],
        reason: {
          kind: "retry_later",
          until: new Date(attemptEndedAt.getTime() + DEFERRED_BACKLOG_RETRY_INTERVAL_MS),
        },
      });
      expect(register.reservations).toEqual([]);
    });
  });

  it("retries a sale once the retry interval passed", async () => {
    const attemptEndedAt = new Date(NOW.getTime() - DEFERRED_BACKLOG_RETRY_INTERVAL_MS);
    const { register, outcome } = catchUp({
      backlog: [sale("sale-1", "2026-10-01T14:00:00.000Z", { lastAttemptEndedAt: attemptEndedAt })],
    });

    expect(await outcome).toEqual({ kind: "completed", invoiced: ["sale-1"] });
    expect(register.reservations).toHaveLength(1);
  });

  it("stops at a rejected sale without invoicing the ones behind it", async () => {
    const { register, taxAuthority, outcome } = catchUp({}, [REJECTED]);

    expect(await outcome).toEqual({
      kind: "stopped",
      invoiced: [],
      reason: { kind: "authorization_not_granted", outcome: "rejected" },
    });
    expect(register.reservations.map(({ saleId }) => saleId)).toEqual(["sale-1"]);
    expect(taxAuthority.calls).toHaveLength(1);
  });

  it("keeps what it invoiced before a rejection and stops there", async () => {
    const { register, outcome } = catchUp({}, [AUTHORIZED, REJECTED]);

    expect(await outcome).toEqual({
      kind: "stopped",
      invoiced: ["sale-1"],
      reason: { kind: "authorization_not_granted", outcome: "rejected" },
    });
    expect(register.reservations.map(({ saleId }) => saleId)).toEqual(["sale-1", "sale-2"]);
  });

  it("stops at a sale whose outcome is unclear, leaving its document to be settled", async () => {
    const { register, outcome } = catchUp({}, [{ kind: "unclear" }]);

    expect(await outcome).toEqual({
      kind: "stopped",
      invoiced: [],
      reason: { kind: "authorization_not_granted", outcome: "unclear" },
    });
    expect(register.reservations.map(({ saleId }) => saleId)).toEqual(["sale-1"]);
  });

  it("satisfies a deferred sale that already holds an authorized document, without invoicing it again", async () => {
    const holder = {
      deferredSaleId: "deferred-of-sale-1",
      saleId: "sale-1",
      origin: ORIGIN,
      fiscalDocumentId: "document-9",
      pointOfSale: 12,
      number: 99,
      issuedOn: "2026-10-01",
      document: HELD_INVOICE,
      authorizationCode: "75123456789012",
      authorizationCodeDueOn: "2026-10-11",
      reservedAt: HELD_RESERVED_AT,
    };
    const { register, outcome } = catchUp({
      backlog: [SECOND],
      holdingAuthorizedDocument: [holder],
    });

    expect(await outcome).toEqual({ kind: "completed", invoiced: ["sale-2"] });
    expect(register.satisfactions).toEqual([
      {
        saleId: "sale-1",
        fiscalDocumentId: "document-9",
        satisfiedAt: NOW,
        event: deferredSaleSatisfiedEvent({
          eventId: "id-1",
          ...ORIGIN,
          deferredSaleId: "deferred-of-sale-1",
          saleId: "sale-1",
          fiscalDocumentId: "document-9",
          pointOfSale: 12,
          number: 99,
          issuedOn: "2026-10-01",
          document: HELD_INVOICE,
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-11",
          reservedAt: HELD_RESERVED_AT,
          satisfiedAt: NOW,
        }),
      },
    ]);
    expect(register.reservations.map(({ saleId }) => saleId)).toEqual(["sale-2"]);
  });

  it("satisfies the records of authorized documents even when it must stop", async () => {
    const holder = {
      deferredSaleId: "deferred-of-sale-1",
      saleId: "sale-1",
      origin: ORIGIN,
      fiscalDocumentId: "document-9",
      pointOfSale: 12,
      number: 99,
      issuedOn: "2026-10-01",
      document: HELD_INVOICE,
      authorizationCode: "75123456789012",
      authorizationCodeDueOn: "2026-10-11",
      reservedAt: HELD_RESERVED_AT,
    };
    const { register, outcome } = catchUp({
      backlog: [],
      awaitingRestoredNumbering: true,
      holdingAuthorizedDocument: [holder],
    });

    await outcome;

    expect(register.satisfactions.map(({ saleId }) => saleId)).toEqual(["sale-1"]);
  });

  it("reports the satisfaction of each sale it invoices through the authorization it reuses", async () => {
    const { register, outcome } = catchUp({ backlog: [FIRST, SECOND] });
    await outcome;

    expect(
      register.resolutions.map(({ deferredSaleSatisfied }) => deferredSaleSatisfied?.payload),
    ).toEqual([
      expect.objectContaining({
        id: "deferred-of-sale-1",
        sale_id: "sale-1",
        number: 101,
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-13",
        reserved_at: NOW.toISOString(),
        document: expect.objectContaining({ invoice_class: "C", total: 1_000 }),
      }),
      expect.objectContaining({
        id: "deferred-of-sale-2",
        sale_id: "sale-2",
        number: 102,
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-13",
        reserved_at: NOW.toISOString(),
        document: expect.objectContaining({ invoice_class: "C", total: 1_000 }),
      }),
    ]);
  });
});

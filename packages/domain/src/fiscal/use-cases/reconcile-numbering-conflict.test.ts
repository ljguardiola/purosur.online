import { describe, expect, it } from "vitest";
import {
  NUMBERING_CONFLICT_REASK_INTERVAL_MS,
  type NumberingReconciliationDocument,
} from "../model/numbering-conflict.js";
import type { LocalStanding } from "../model/orphan-authorization.js";
import type { TaxAuthorityVoucher } from "../model/unclear-outcome-decision.js";
import { reconcileNumberingConflict } from "./reconcile-numbering-conflict.js";
import type { LastAuthorizedAnswer } from "./tax-authority-count-ports.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  FakeNumberingConflictStore,
  FakeNumberingTaxAuthority,
  FakeNumberingTokens,
} from "./test-support/fake-numbering-conflict.js";
import { SequentialIds } from "./test-support/fake-sale-authorization.js";
import type { VoucherAnswer } from "./unclear-outcome-ports.js";

const FROZEN_AT = new Date("2026-10-01T10:00:00.000Z");
const NOW = new Date("2026-10-01T12:00:00.000Z");
const ASK_AGAIN_AT = new Date(NOW.getTime() + NUMBERING_CONFLICT_REASK_INTERVAL_MS);

const TOKEN = {
  token: "token",
  sign: "sign",
  issuedAt: new Date("2026-10-01T08:00:00.000Z"),
  expiresAt: new Date("2026-10-01T20:00:00.000Z"),
};

const VOUCHER: TaxAuthorityVoucher = {
  issuedOn: "2026-10-01",
  total: 12_500,
  documentType: 11,
  receiverDocumentType: 99,
  receiverDocumentNumber: 0,
  receiverTaxStatusCode: 5,
  authorizationCode: "75123456789012",
  authorizationCodeDueOn: "2026-10-11",
};

const authorized = (number: number): NumberingReconciliationDocument => ({
  number,
  settlement: "authorized",
});

interface Scenario {
  frozen?: boolean;
  token?: typeof TOKEN | null;
  lastAuthorized?: LastAuthorizedAnswer;
  documents?: NumberingReconciliationDocument[];
  count?: number;
  voucher?: VoucherAnswer | ((number: number) => VoucherAnswer);
  standings?: [number, LocalStanding][];
}

function scenario({
  frozen = true,
  token = TOKEN,
  lastAuthorized = { kind: "read", number: 14 },
  documents = [authorized(11), authorized(12), authorized(13), authorized(14)],
  count = 10,
  voucher = { kind: "found", voucher: VOUCHER },
  standings = [],
}: Scenario = {}) {
  const store = new FakeNumberingConflictStore();
  store.seedCount(12, count);
  store.seedDocuments(12, documents);
  if (frozen) {
    store.seedFreeze(12, { countBeforeFreeze: 10, frozenAt: FROZEN_AT });
  }
  for (const [number, standing] of standings) {
    store.seedStanding(12, number, standing);
  }
  const taxAuthority = new FakeNumberingTaxAuthority(store, lastAuthorized, voucher);
  const ports = {
    lanes: store,
    clock: new ManualClock(NOW),
    ids: new SequentialIds(),
    tokens: new FakeNumberingTokens(token),
    vouchers: taxAuthority,
    taxAuthority,
  };
  return { store, taxAuthority, ports };
}

function reconcile(ports: ReturnType<typeof scenario>["ports"]) {
  return reconcileNumberingConflict(ports, { pointOfSale: 12 });
}

const STILL_FROZEN = { countBeforeFreeze: 10, frozenAt: FROZEN_AT };

describe("reconcileNumberingConflict", () => {
  it("answers not frozen without asking the tax authority when the point of sale is not frozen", async () => {
    const { store, taxAuthority, ports } = scenario({ frozen: false });

    expect(await reconcile(ports)).toEqual({ kind: "not_frozen" });
    expect(taxAuthority.lastAuthorizedAsked).toBe(0);
    expect(store.alerts).toEqual([]);
    expect(store.countOf(12)).toBe(10);
  });

  it("retries and stays frozen when no token is valid", async () => {
    const { store, taxAuthority, ports } = scenario({ token: null });

    expect(await reconcile(ports)).toEqual({ kind: "retry", askAgainAt: ASK_AGAIN_AT });
    expect(taxAuthority.lastAuthorizedAsked).toBe(0);
    expect(store.freezeOf(12)).toEqual(STILL_FROZEN);
    expect(store.alerts).toEqual([]);
    expect(store.countOf(12)).toBe(10);
  });

  it("retries and stays frozen when the tax authority's last authorized number cannot be read", async () => {
    const { store, ports } = scenario({ lastAuthorized: { kind: "no_answer" } });

    expect(await reconcile(ports)).toEqual({ kind: "retry", askAgainAt: ASK_AGAIN_AT });
    expect(store.freezeOf(12)).toEqual(STILL_FROZEN);
    expect(store.alerts).toEqual([]);
    expect(store.countOf(12)).toBe(10);
  });

  it("reads the tax authority inside the point of sale's lane", async () => {
    const { taxAuthority, ports } = scenario();

    await reconcile(ports);

    expect(taxAuthority.heldLaneDuringLookups).toEqual([true]);
  });

  it("waits and stays frozen while a document of the range is undecided", async () => {
    const { store, ports } = scenario({
      documents: [authorized(11), { number: 12, settlement: "undecided" }],
    });

    expect(await reconcile(ports)).toEqual({ kind: "waiting", askAgainAt: ASK_AGAIN_AT });
    expect(store.freezeOf(12)).toEqual(STILL_FROZEN);
    expect(store.alerts).toEqual([]);
    expect(store.countOf(12)).toBe(10);
  });

  it("reconciles without alerts when an authorized document accounts for every number", async () => {
    const { store, ports } = scenario();

    expect(await reconcile(ports)).toEqual({
      kind: "reconciled",
      lastAuthorized: 14,
      alertedNumbers: [],
      creditNotedNumbers: [],
    });
    expect(store.alerts).toEqual([]);
    expect(store.countOf(12)).toBe(14);
    expect(store.freezeOf(12)).toBeUndefined();
  });

  it("alerts a number with no document", async () => {
    const { store, ports } = scenario({
      documents: [authorized(11), authorized(13), authorized(14)],
    });

    expect(await reconcile(ports)).toMatchObject({ alertedNumbers: [12] });
    expect(store.alerts).toEqual([{ pointOfSale: 12, documentType: "factura_c", number: 12 }]);
  });

  it("alerts a number whose document was released or rejected", async () => {
    const { store, ports } = scenario({
      documents: [
        authorized(11),
        { number: 12, settlement: "released_or_rejected" },
        authorized(13),
        authorized(14),
      ],
    });

    expect(await reconcile(ports)).toMatchObject({ alertedNumbers: [12] });
    expect(store.alerts.map(({ number }) => number)).toEqual([12]);
  });

  it("alerts a number whose document is conflicting", async () => {
    const { store, ports } = scenario({
      documents: [
        authorized(11),
        authorized(12),
        { number: 13, settlement: "conflicting" },
        authorized(14),
      ],
    });

    expect(await reconcile(ports)).toMatchObject({ alertedNumbers: [13] });
    expect(store.alerts.map(({ number }) => number)).toEqual([13]);
  });

  it("does not alert a number when one of several documents at it is authorized", async () => {
    const { store, ports } = scenario({
      documents: [
        { number: 11, settlement: "released_or_rejected" },
        authorized(11),
        { number: 12, settlement: "conflicting" },
        authorized(12),
        authorized(13),
        authorized(14),
      ],
    });

    expect(await reconcile(ports)).toMatchObject({ alertedNumbers: [] });
    expect(store.alerts).toEqual([]);
  });

  it("ignores documents at or below the count before the freeze and above the last authorized number", async () => {
    const { ports } = scenario({
      documents: [
        { number: 10, settlement: "undecided" },
        authorized(11),
        authorized(12),
        authorized(13),
        authorized(14),
        { number: 15, settlement: "undecided" },
      ],
    });

    expect(await reconcile(ports)).toMatchObject({ kind: "reconciled" });
  });

  it("settles once, with an alert for each number without an own document and the last authorized number", async () => {
    const { store, ports } = scenario({ documents: [authorized(11), authorized(14)] });

    await reconcile(ports);

    expect(
      store.operations.filter((operation) => operation.startsWith("settleNumberingReconciliation")),
    ).toEqual(["settleNumberingReconciliation"]);
    expect(store.alerts).toEqual([
      { pointOfSale: 12, documentType: "factura_c", number: 12 },
      { pointOfSale: 12, documentType: "factura_c", number: 13 },
    ]);
    expect(store.countOf(12)).toBe(14);
    expect(store.freezeOf(12)).toBeUndefined();
  });

  it("never lowers a count above the last authorized number", async () => {
    const { store, ports } = scenario({ count: 20 });

    expect(await reconcile(ports)).toMatchObject({ kind: "reconciled" });
    expect(store.countOf(12)).toBe(20);
  });

  it("reconciles an empty range when the tax authority is still at the count before the freeze", async () => {
    const { store, ports } = scenario({
      lastAuthorized: { kind: "read", number: 10 },
      documents: [],
    });

    expect(await reconcile(ports)).toEqual({
      kind: "reconciled",
      lastAuthorized: 10,
      alertedNumbers: [],
      creditNotedNumbers: [],
    });
    expect(store.freezeOf(12)).toBeUndefined();
  });

  it("leaves the alerts, the count and the freeze as they were when settling fails", async () => {
    const { store, ports } = scenario({ documents: [authorized(11), authorized(14)] });
    store.failOn = "settleNumberingReconciliation";

    await expect(reconcile(ports)).rejects.toThrow();
    expect(store.alerts).toEqual([]);
    expect(store.countOf(12)).toBe(10);
    expect(store.freezeOf(12)).toEqual(STILL_FROZEN);
  });

  describe("confirming each authorization without an own document", () => {
    const FAR_AWAY: LocalStanding = {
      kind: "local_sale",
      saleId: "sale-9",
      otherAuthorizedVoucher: { voucherType: 11, pointOfSale: 13, number: 7 },
    };
    const gaps = { documents: [authorized(11), authorized(14)] };

    it("asks the tax authority for the factura C of each number without an own document, in the lane", async () => {
      const { taxAuthority, ports } = scenario(gaps);

      await reconcile(ports);

      expect(taxAuthority.vouchersAsked).toEqual([12, 13]);
      expect(taxAuthority.voucherTypesAsked).toEqual([11, 11]);
      expect(taxAuthority.heldLaneDuringLookups).toEqual([true, true, true]);
    });

    it("opens an alert and a task for a person for each confirmed authorization with no local sale", async () => {
      const { store, ports } = scenario({
        ...gaps,
        voucher: (number) => ({
          kind: "found",
          voucher: { ...VOUCHER, total: number * 100, authorizationCode: `cae-${number}` },
        }),
      });

      expect(await reconcile(ports)).toEqual({
        kind: "reconciled",
        lastAuthorized: 14,
        alertedNumbers: [12, 13],
        creditNotedNumbers: [],
      });
      expect(store.alerts).toEqual([
        { pointOfSale: 12, documentType: "factura_c", number: 12 },
        { pointOfSale: 12, documentType: "factura_c", number: 13 },
      ]);
      expect(store.tasks).toEqual([
        {
          kind: "external_invoicing",
          state: "open",
          pointOfSale: 12,
          documentType: "factura_c",
          number: 12,
          voucher: { issuedOn: "2026-10-01", total: 1_200, authorizationCode: "cae-12" },
          createdAt: NOW,
        },
        {
          kind: "external_invoicing",
          state: "open",
          pointOfSale: 12,
          documentType: "factura_c",
          number: 13,
          voucher: { issuedOn: "2026-10-01", total: 1_300, authorizationCode: "cae-13" },
          createdAt: NOW,
        },
      ]);
      expect(store.freezeOf(12)).toBeUndefined();
    });

    it("corrects with a credit note, and raises no alert, a confirmed authorization of a sale that has another authorized voucher", async () => {
      const { store, ports } = scenario({
        documents: [authorized(11), authorized(12), authorized(14)],
        standings: [[13, FAR_AWAY]],
      });

      expect(await reconcile(ports)).toEqual({
        kind: "reconciled",
        lastAuthorized: 14,
        alertedNumbers: [],
        creditNotedNumbers: [13],
      });
      expect(store.alerts).toEqual([]);
      expect(store.creditNotes).toEqual([
        {
          kind: "credit_note",
          creditNoteId: "id-1",
          saleId: "sale-9",
          pointOfSale: 12,
          associatedVoucher: { voucherType: 11, pointOfSale: 12, number: 13 },
          keptVoucher: { voucherType: 11, pointOfSale: 13, number: 7 },
          total: 12_500,
          receiverTaxStatusCode: 5,
        },
      ]);
    });

    it.each<[string, LocalStanding]>([
      [
        "the only voucher of its sale",
        { kind: "local_sale", saleId: "sale-9", otherAuthorizedVoucher: null },
      ],
      ["already regularized", { kind: "already_regularized" }],
    ])(
      "regularizes nothing for an authorization that is %s, and still lifts the freeze",
      async (_case, standing) => {
        const { store, ports } = scenario({
          ...gaps,
          standings: [
            [12, standing],
            [13, standing],
          ],
        });

        expect(await reconcile(ports)).toEqual({
          kind: "reconciled",
          lastAuthorized: 14,
          alertedNumbers: [],
          creditNotedNumbers: [],
        });
        expect(store.regularizations).toEqual([]);
        expect(store.freezeOf(12)).toBeUndefined();
      },
    );

    it("settles the regularizations, the count and the freeze in one storage operation", async () => {
      const { store, ports } = scenario(gaps);

      await reconcile(ports);

      expect(store.operations.at(-2)).toBe("settleNumberingReconciliation");
    });

    it.each<[string, VoucherAnswer, "waiting" | "retry"]>([
      ["shows no voucher at the number", { kind: "none" }, "waiting"],
      ["does not answer", { kind: "no_answer" }, "retry"],
    ])(
      "settles nothing and keeps the freeze while the tax authority %s",
      async (_case, answer, kind) => {
        const { store, taxAuthority, ports } = scenario({ ...gaps, voucher: answer });

        expect(await reconcile(ports)).toEqual({ kind, askAgainAt: ASK_AGAIN_AT });
        expect(taxAuthority.vouchersAsked).toEqual([12]);
        expect(store.regularizations).toEqual([]);
        expect(store.freezeOf(12)).toEqual(STILL_FROZEN);
        expect(store.countOf(12)).toBe(10);
        expect(store.operations).not.toContain("settleNumberingReconciliation");
      },
    );

    it("keeps everything as it was when only the last of several numbers is unconfirmed", async () => {
      const { store, ports } = scenario({
        ...gaps,
        voucher: (number) =>
          number === 13 ? { kind: "none" } : { kind: "found", voucher: VOUCHER },
      });

      expect(await reconcile(ports)).toEqual({ kind: "waiting", askAgainAt: ASK_AGAIN_AT });
      expect(store.regularizations).toEqual([]);
      expect(store.freezeOf(12)).toEqual(STILL_FROZEN);
    });

    it("asks nothing about vouchers when every number has an own document", async () => {
      const { taxAuthority, ports } = scenario();

      await reconcile(ports);

      expect(taxAuthority.vouchersAsked).toEqual([]);
    });
  });
});

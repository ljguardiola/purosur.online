import { describe, expect, it } from "vitest";
import { NUMBERING_CONFLICT_REASK_INTERVAL_MS } from "../model/numbering-conflict.js";
import type { TaxAuthorityVoucher } from "../model/unclear-outcome-decision.js";
import { diagnoseNumberingConflict } from "./diagnose-numbering-conflict.js";
import type { LastAuthorizedAnswer } from "./tax-authority-count-ports.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  FakeNumberingConflictStore,
  FakeNumberingTaxAuthority,
  FakeNumberingTokens,
  type SeededNumberingRequest,
} from "./test-support/fake-numbering-conflict.js";
import type { VoucherAnswer } from "./unclear-outcome-ports.js";

const FISCAL_DOCUMENT_ID = "fiscal-document-1";
const NOW = new Date("2026-10-01T12:00:00.000Z");
const RETRY = {
  kind: "retry",
  askAgainAt: new Date(NOW.getTime() + NUMBERING_CONFLICT_REASK_INTERVAL_MS),
};

const TOKEN = {
  token: "token",
  sign: "sign",
  issuedAt: new Date("2026-10-01T08:00:00.000Z"),
  expiresAt: new Date("2026-10-01T20:00:00.000Z"),
};

const VOUCHER_OF_2026_10_02: TaxAuthorityVoucher = {
  issuedOn: "2026-10-02",
  total: 9_000,
  documentType: 11,
  receiverDocumentType: 99,
  receiverDocumentNumber: 0,
  receiverTaxStatusCode: 5,
  authorizationCode: "75123456789012",
  authorizationCodeDueOn: "2026-10-12",
};

const REQUEST: SeededNumberingRequest = {
  fiscalDocumentId: FISCAL_DOCUMENT_ID,
  pointOfSale: 12,
  number: 41,
  issuedOn: "2026-10-01",
  answer: { kind: "unclear" },
  unclearCodes: [10016],
};

interface Scenario {
  request?: Partial<SeededNumberingRequest>;
  seedRequest?: boolean;
  token?: typeof TOKEN | null;
  lastAuthorized?: LastAuthorizedAnswer;
  voucher?: VoucherAnswer;
  count?: number;
  frozen?: { countBeforeFreeze: number; frozenAt: Date };
}

function scenario({
  request = {},
  seedRequest = true,
  token = TOKEN,
  lastAuthorized = { kind: "read", number: 40 },
  voucher = { kind: "found", voucher: VOUCHER_OF_2026_10_02 },
  count = 40,
  frozen,
}: Scenario = {}) {
  const store = new FakeNumberingConflictStore();
  if (seedRequest) {
    store.seedRequest({ ...REQUEST, ...request });
  }
  store.seedCount(12, count);
  if (frozen !== undefined) {
    store.seedFreeze(12, frozen);
  }
  const taxAuthority = new FakeNumberingTaxAuthority(store, lastAuthorized, voucher);
  const ports = {
    requests: store,
    lanes: store,
    clock: new ManualClock(NOW),
    tokens: new FakeNumberingTokens(token),
    vouchers: taxAuthority,
    taxAuthority,
  };
  return { store, taxAuthority, ports };
}

function diagnose(ports: ReturnType<typeof scenario>["ports"]) {
  return diagnoseNumberingConflict(ports, { fiscalDocumentId: FISCAL_DOCUMENT_ID });
}

describe("diagnoseNumberingConflict", () => {
  it("answers not found for a request nobody recorded, without entering a lane", async () => {
    const { store, ports } = scenario({ seedRequest: false });

    expect(await diagnose(ports)).toEqual({ kind: "not_found" });
    expect(store.operations).toEqual([]);
  });

  it("answers not found when the request vanishes before its lane reads it", async () => {
    const { store, ports } = scenario();
    store.vanishAfterLookup = true;

    expect(await diagnose(ports)).toEqual({ kind: "not_found" });
  });

  it.each([
    ["no answer", { answer: null, unclearCodes: [] }],
    [
      "an authorization",
      {
        answer: {
          kind: "authorized",
          authorizationCode: "1",
          authorizationCodeDueOn: "2026-10-11",
        },
        unclearCodes: [],
      },
    ],
    [
      "a rejection",
      { answer: { kind: "rejected", codes: [10016], rejectionClass: "content" }, unclearCodes: [] },
    ],
    [
      "an unclear answer for other codes",
      { answer: { kind: "unclear" }, unclearCodes: [600, 10000] },
    ],
    ["an unclear answer with no codes", { answer: { kind: "unclear" }, unclearCodes: [] }],
    [
      "a request that was not attempted",
      { answer: { kind: "not_attempted" }, unclearCodes: [10016] },
    ],
  ] as const)("answers not a numbering conflict for %s", async (_case, request) => {
    const { store, taxAuthority, ports } = scenario({ request });

    expect(await diagnose(ports)).toEqual({ kind: "not_a_numbering_conflict" });
    expect(taxAuthority.lastAuthorizedAsked).toBe(0);
    expect(store.freezeOf(12)).toBeUndefined();
  });

  it("answers already diagnosed with the recorded diagnosis, without asking the tax authority", async () => {
    const { store, taxAuthority, ports } = scenario({
      request: { diagnosis: { kind: "date_behind" } },
    });

    expect(await diagnose(ports)).toEqual({
      kind: "already_diagnosed",
      diagnosis: { kind: "date_behind" },
    });
    expect(taxAuthority.lastAuthorizedAsked).toBe(0);
    expect(store.freezeOf(12)).toBeUndefined();
  });

  it("retries without recording anything when no token is valid", async () => {
    const { store, taxAuthority, ports } = scenario({ token: null });

    expect(await diagnose(ports)).toEqual(RETRY);
    expect(taxAuthority.lastAuthorizedAsked).toBe(0);
    expect(store.diagnosisOf(FISCAL_DOCUMENT_ID)).toBeNull();
    expect(store.freezeOf(12)).toBeUndefined();
  });

  it("retries without recording anything when the last authorized number cannot be read", async () => {
    const { store, taxAuthority, ports } = scenario({ lastAuthorized: { kind: "no_answer" } });

    expect(await diagnose(ports)).toEqual(RETRY);
    expect(taxAuthority.vouchersAsked).toEqual([]);
    expect(store.diagnosisOf(FISCAL_DOCUMENT_ID)).toBeNull();
    expect(store.freezeOf(12)).toBeUndefined();
  });

  it("retries without recording anything when the last authorized voucher cannot be read", async () => {
    const { store, taxAuthority, ports } = scenario({ voucher: { kind: "no_answer" } });

    expect(await diagnose(ports)).toEqual(RETRY);
    expect(taxAuthority.vouchersAsked).toEqual([40]);
    expect(store.diagnosisOf(FISCAL_DOCUMENT_ID)).toBeNull();
    expect(store.freezeOf(12)).toBeUndefined();
  });

  it("reads the tax authority inside the point of sale's lane", async () => {
    const { store, taxAuthority, ports } = scenario();

    await diagnose(ports);

    expect(taxAuthority.heldLaneDuringLookups).toEqual([true, true]);
    expect(store.operations.at(0)).toBe("enterLane");
    expect(store.operations.at(-1)).toBe("leaveLane");
  });

  it("records a date behind and freezes nothing when the next number only carries an earlier date than the last authorized voucher", async () => {
    const { store, ports } = scenario();

    expect(await diagnose(ports)).toEqual({ kind: "date_behind" });
    expect(store.diagnosisOf(FISCAL_DOCUMENT_ID)).toEqual({ kind: "date_behind" });
    expect(store.freezeOf(12)).toBeUndefined();
    expect(store.reconciliationRequests).toEqual([]);
  });

  it("records a collision, freezes the point of sale at the count held and asks for a reconciliation when the date is not behind", async () => {
    const { store, ports } = scenario({ request: { issuedOn: "2026-10-02" }, count: 37 });

    expect(await diagnose(ports)).toEqual({ kind: "collision", freeze: "frozen" });
    expect(store.diagnosisOf(FISCAL_DOCUMENT_ID)).toEqual({ kind: "collision" });
    expect(store.freezeOf(12)).toEqual({ countBeforeFreeze: 37, frozenAt: NOW });
    expect(store.reconciliationRequests).toEqual([12]);
  });

  it("freezes at a count of zero for a point of sale holding no count", async () => {
    const { store, ports } = scenario({ request: { issuedOn: "2026-10-02" } });
    store.current.counts.clear();

    await diagnose(ports);

    expect(store.freezeOf(12)).toEqual({ countBeforeFreeze: 0, frozenAt: NOW });
  });

  it("finds a collision when the number is not the next after the last authorized one", async () => {
    const { store, ports } = scenario({ lastAuthorized: { kind: "read", number: 45 } });

    expect(await diagnose(ports)).toEqual({ kind: "collision", freeze: "frozen" });
    expect(store.diagnosisOf(FISCAL_DOCUMENT_ID)).toEqual({ kind: "collision" });
  });

  it("finds a collision when ARCA holds no voucher at its last authorized number", async () => {
    const { ports } = scenario({ voucher: { kind: "none" } });

    expect(await diagnose(ports)).toEqual({ kind: "collision", freeze: "frozen" });
  });

  it("reads no voucher and finds a collision when nothing was authorized yet", async () => {
    const { taxAuthority, ports } = scenario({
      lastAuthorized: { kind: "read", number: 0 },
      request: { number: 3 },
    });

    expect(await diagnose(ports)).toEqual({ kind: "collision", freeze: "frozen" });
    expect(taxAuthority.vouchersAsked).toEqual([]);
  });

  it("does not freeze again nor ask again for a reconciliation when the point of sale is already frozen", async () => {
    const frozenAt = new Date("2026-09-30T10:00:00.000Z");
    const { store, ports } = scenario({
      request: { issuedOn: "2026-10-02" },
      count: 44,
      frozen: { countBeforeFreeze: 37, frozenAt },
    });

    expect(await diagnose(ports)).toEqual({ kind: "collision", freeze: "already_frozen" });
    expect(store.diagnosisOf(FISCAL_DOCUMENT_ID)).toEqual({ kind: "collision" });
    expect(store.freezeOf(12)).toEqual({ countBeforeFreeze: 37, frozenAt });
    expect(store.reconciliationRequests).toEqual([]);
  });

  it("leaves neither the diagnosis nor the freeze behind when asking for the reconciliation fails", async () => {
    const { store, ports } = scenario({ request: { issuedOn: "2026-10-02" } });
    store.failOn = "requestNumberingReconciliation";

    await expect(diagnose(ports)).rejects.toThrow();
    expect(store.diagnosisOf(FISCAL_DOCUMENT_ID)).toBeNull();
    expect(store.freezeOf(12)).toBeUndefined();
  });
});

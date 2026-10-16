import { describe, expect, it } from "vitest";
import {
  type TaxAuthorityVoucher,
  UNCLEAR_OUTCOME_REASK_INTERVAL_MS,
  UNCLEAR_OUTCOME_SETTLING_DELAY_MS,
} from "../model/unclear-outcome-decision.js";
import {
  type CreditNote,
  CreditNoteNumberTaken,
  type CreditNoteStanding,
} from "./credit-note-ports.js";
import type { SolicitationAnswer } from "./fiscal-document-authorization-ports.js";
import {
  creditNoteAnswerOf,
  type IssueCreditNoteOutcome,
  issueCreditNote,
} from "./issue-credit-note.js";
import type { LastAuthorizedAnswer } from "./tax-authority-count-ports.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  FakeCreditNoteInvoicing,
  FakeCreditNoteStore,
  FakeCreditNoteTaxAuthority,
  FakeCreditNoteTokens,
} from "./test-support/fake-credit-notes.js";
import type { VoucherAnswer } from "./unclear-outcome-ports.js";

const CREDIT_NOTE_ID = "credit-note-1";
const NOW = new Date("2026-10-03T01:30:00.000Z");
const ISSUE_DAY = "2026-10-02";

const TOKEN = {
  token: "token",
  sign: "sign",
  issuedAt: new Date("2026-10-02T08:00:00.000Z"),
  expiresAt: new Date("2026-10-03T20:00:00.000Z"),
};

const AUTHORIZED_ANSWER: SolicitationAnswer = {
  kind: "authorized",
  authorizationCode: "75123456789099",
  authorizationCodeDueOn: "2026-10-12",
};

const REQUESTED_AT = new Date("2026-10-03T01:00:00.000Z");

const CREDIT_NOTE_VOUCHER: TaxAuthorityVoucher = {
  issuedOn: ISSUE_DAY,
  total: 12_500,
  documentType: 13,
  receiverDocumentType: 99,
  receiverDocumentNumber: 0,
  receiverTaxStatusCode: 5,
  authorizationCode: "75123456789055",
  authorizationCodeDueOn: "2026-10-12",
};

interface Scenario {
  standing?: CreditNoteStanding;
  token?: typeof TOKEN | null;
  lastAuthorized?: LastAuthorizedAnswer;
  voucher?: VoucherAnswer;
  answer?: SolicitationAnswer;
  now?: Date;
  others?: { pointOfSale: number; standing: CreditNoteStanding }[];
}

function scenario({
  standing = { kind: "not_requested" },
  token = TOKEN,
  lastAuthorized = { kind: "read", number: 41 },
  voucher = { kind: "none" },
  answer = AUTHORIZED_ANSWER,
  now = NOW,
  others = [],
}: Scenario = {}) {
  const store = new FakeCreditNoteStore();
  const creditNote: CreditNote = {
    creditNoteId: CREDIT_NOTE_ID,
    pointOfSale: 12,
    associatedVoucher: { voucherType: 11, pointOfSale: 12, number: 41 },
    total: 12_500,
    receiverTaxStatusCode: 5,
    reason: "orphan",
    standing,
  };
  store.seed(creditNote);
  others.forEach(({ pointOfSale, standing: otherStanding }, index) => {
    store.seed({
      ...creditNote,
      creditNoteId: `credit-note-other-${index}`,
      pointOfSale,
      associatedVoucher: { voucherType: 11, pointOfSale, number: 100 + index },
      standing: otherStanding,
    });
  });
  const taxAuthority = new FakeCreditNoteTaxAuthority(store, voucher, lastAuthorized);
  const creditNotes = new FakeCreditNoteInvoicing(store, answer);
  const clock = new ManualClock(now);
  const ports = {
    requests: store,
    lanes: store,
    clock,
    tokens: new FakeCreditNoteTokens(store, token),
    vouchers: taxAuthority,
    taxAuthority,
    creditNotes,
  };
  return { store, taxAuthority, creditNotes, clock, ports };
}

function issue(ports: ReturnType<typeof scenario>["ports"], creditNoteId = CREDIT_NOTE_ID) {
  return issueCreditNote(ports, { creditNoteId });
}

describe("issueCreditNote", () => {
  it("reports a credit note the cloud has no record of, without taking a lane", async () => {
    const { store, ports } = scenario();

    expect(await issue(ports, "unknown")).toEqual({ kind: "not_found" });
    expect(store.lanesEntered).toEqual([]);
  });

  it("reports a credit note that disappeared before its lane was taken", async () => {
    const { store, ports } = scenario();
    store.vanishAfterLookup = true;

    expect(await issue(ports)).toEqual({ kind: "not_found" });
  });

  it.each<[string, CreditNoteStanding, object]>([
    [
      "authorized",
      {
        kind: "authorized",
        number: 40,
        issuedOn: "2026-10-01",
        authorizationCode: "75123456789011",
        authorizationCodeDueOn: "2026-10-11",
      },
      {
        kind: "already_authorized",
        pointOfSale: 12,
        number: 40,
        issuedOn: "2026-10-01",
        authorizationCode: "75123456789011",
        authorizationCodeDueOn: "2026-10-11",
      },
    ],
    ["rejected", { kind: "rejected" }, { kind: "already_rejected" }],
  ])("does nothing with a credit note already %s", async (_case, standing, outcome) => {
    const { store, taxAuthority, creditNotes, ports } = scenario({ standing });

    expect(await issue(ports)).toEqual(outcome);
    expect(store.operations).toEqual(["enterLane", "creditNote", "leaveLane"]);
    expect(taxAuthority.voucherLookups).toEqual([]);
    expect(creditNotes.solicitations).toEqual([]);
  });

  describe("requesting a credit note", () => {
    it("numbers the credit note after the last credit note C the tax authority authorized at the point of sale", async () => {
      const { taxAuthority, creditNotes, ports } = scenario({
        lastAuthorized: { kind: "read", number: 7 },
      });

      await issue(ports);

      expect(taxAuthority.lastAuthorizedLookups).toEqual([{ pointOfSale: 12, voucherType: 13 }]);
      expect(creditNotes.solicitations[0]?.number).toBe(8);
    });

    it("asks the tax authority for a credit note C associated to the orphan by type, point of sale and number, dated the day it is issued", async () => {
      const { creditNotes, ports } = scenario();

      await issue(ports);

      expect(creditNotes.solicitations).toEqual([
        {
          token: TOKEN,
          pointOfSale: 12,
          number: 42,
          issuedOn: ISSUE_DAY,
          total: 12_500,
          receiverTaxStatusCode: 5,
          associatedVoucher: { voucherType: 11, pointOfSale: 12, number: 41 },
        },
      ]);
    });

    it("records the request before the call to the tax authority and the answer after it, in the lane", async () => {
      const { store, creditNotes, ports } = scenario();

      await issue(ports);

      expect(store.operations).toEqual([
        "enterLane",
        "creditNote",
        "validToken",
        "otherCreditNoteStandings",
        "lastAuthorized",
        "recordCreditNoteRequest",
        "solicit",
        "recordCreditNoteAuthorized",
        "leaveLane",
      ]);
      expect(store.requests).toEqual([
        { creditNoteId: CREDIT_NOTE_ID, number: 42, issuedOn: ISSUE_DAY, requestedAt: NOW },
      ]);
      expect(creditNotes.requestsRecordedDuringSolicit).toBe(1);
      expect(creditNotes.heldLaneDuringSolicit).toBe(true);
    });

    it("records the authorization code of an authorized credit note", async () => {
      const { store, ports } = scenario();

      expect(await issue(ports)).toEqual({
        kind: "authorized",
        pointOfSale: 12,
        number: 42,
        issuedOn: ISSUE_DAY,
        authorizationCode: "75123456789099",
        authorizationCodeDueOn: "2026-10-12",
      });
      expect(store.authorizations).toEqual([
        {
          creditNoteId: CREDIT_NOTE_ID,
          authorizationCode: "75123456789099",
          authorizationCodeDueOn: "2026-10-12",
          authorizedAt: NOW,
        },
      ]);
      expect(store.standingOf(CREDIT_NOTE_ID)).toEqual({
        kind: "authorized",
        number: 42,
        issuedOn: ISSUE_DAY,
        authorizationCode: "75123456789099",
        authorizationCodeDueOn: "2026-10-12",
      });
    });

    it.each<[string, Scenario]>([
      ["there is no valid token", { token: null }],
      ["the last authorized number cannot be read", { lastAuthorized: { kind: "no_answer" } }],
    ])("asks again later, recording and calling nothing, when %s", async (_case, change) => {
      const { store, creditNotes, ports } = scenario(change);

      expect(await issue(ports)).toEqual({
        kind: "retry",
        askAgainAt: new Date(NOW.getTime() + UNCLEAR_OUTCOME_REASK_INTERVAL_MS),
      });
      expect(store.requests).toEqual([]);
      expect(creditNotes.solicitations).toEqual([]);
    });
  });

  describe("another credit note of the point of sale awaiting its answer", () => {
    const OTHER_REQUESTED: CreditNoteStanding = {
      kind: "requested",
      number: 42,
      issuedOn: ISSUE_DAY,
      requestedAt: REQUESTED_AT,
      unclearAnsweredAt: REQUESTED_AT,
    };

    it("takes no number while another credit note of the point of sale awaits its answer, asking again later", async () => {
      const { store, taxAuthority, creditNotes, ports } = scenario({
        others: [{ pointOfSale: 12, standing: OTHER_REQUESTED }],
      });

      expect(await issue(ports)).toEqual({
        kind: "retry",
        askAgainAt: new Date(NOW.getTime() + UNCLEAR_OUTCOME_REASK_INTERVAL_MS),
      });
      expect(taxAuthority.lastAuthorizedLookups).toEqual([]);
      expect(store.requests).toEqual([]);
      expect(creditNotes.solicitations).toEqual([]);
    });

    it("numbers the credit note when the other one awaits its answer on another point of sale", async () => {
      const { creditNotes, ports } = scenario({
        others: [{ pointOfSale: 13, standing: OTHER_REQUESTED }],
      });

      expect(await issue(ports)).toMatchObject({ kind: "authorized", number: 42 });
      expect(creditNotes.solicitations).toHaveLength(1);
    });

    it("asks again later, calling the tax authority for nothing, when its number was taken meanwhile", async () => {
      const { store, creditNotes, ports } = scenario();
      store.requestFailure = new CreditNoteNumberTaken();

      expect(await issue(ports)).toEqual({
        kind: "retry",
        askAgainAt: new Date(NOW.getTime() + UNCLEAR_OUTCOME_REASK_INTERVAL_MS),
      });
      expect(creditNotes.solicitations).toEqual([]);
      expect(store.standingOf(CREDIT_NOTE_ID)).toEqual({ kind: "not_requested" });
    });

    it("lets any other failure to record the request through", async () => {
      const { store, ports } = scenario();
      store.requestFailure = new Error("storage down");

      await expect(issue(ports)).rejects.toThrow("storage down");
    });
  });

  describe("an answer of the tax authority", () => {
    it("records a rejected credit note together with a task for a person, and never retries it", async () => {
      const rejections = [{ code: 10015, message: "invalid receiver" }];
      const { store, creditNotes, ports } = scenario({ answer: { kind: "rejected", rejections } });

      expect(await issue(ports)).toEqual({ kind: "rejected", rejections });
      expect(store.rejections).toEqual([{ rejections, rejectedAt: NOW }]);
      expect(store.tasks).toEqual([
        {
          kind: "credit_note_rejected",
          state: "open",
          pointOfSale: 12,
          documentType: "credit_note_c",
          number: 42,
          creditNoteId: CREDIT_NOTE_ID,
          rejections,
          createdAt: NOW,
        },
      ]);

      expect(await issue(ports)).toEqual({ kind: "already_rejected" });
      expect(creditNotes.solicitations).toHaveLength(1);
    });

    it("rejects a refusal for a standing reason", async () => {
      const rejections = [{ code: 10000, message: "standing" }];
      const { store, ports } = scenario({ answer: { kind: "refused_without_result", rejections } });

      expect(await issue(ports)).toEqual({ kind: "rejected", rejections });
      expect(store.tasks).toHaveLength(1);
    });

    it.each<[string, SolicitationAnswer]>([
      ["no answer", { kind: "no_answer", rejections: [] }],
      ["a numbering conflict", { kind: "rejected", rejections: [{ code: 10016, message: "x" }] }],
      ["an internal error", { kind: "rejected", rejections: [{ code: 600, message: "x" }] }],
      [
        "a refusal that is not a standing one",
        { kind: "refused_without_result", rejections: [{ code: 10015, message: "x" }] },
      ],
    ])(
      "leaves the outcome unclear and asks again once it settles after %s",
      async (_case, answer) => {
        const { store, ports } = scenario({ answer });

        expect(await issue(ports)).toEqual({
          kind: "retry",
          askAgainAt: new Date(NOW.getTime() + UNCLEAR_OUTCOME_SETTLING_DELAY_MS),
        });
        expect(store.operations).toContain("recordCreditNoteUnclear");
        expect(store.tasks).toEqual([]);
        expect(store.standingOf(CREDIT_NOTE_ID)).toEqual({
          kind: "requested",
          number: 42,
          issuedOn: ISSUE_DAY,
          requestedAt: NOW,
          unclearAnsweredAt: NOW,
        });
      },
    );
  });

  describe("settling an earlier request whose outcome is unclear", () => {
    const REQUESTED: CreditNoteStanding = {
      kind: "requested",
      number: 42,
      issuedOn: ISSUE_DAY,
      requestedAt: REQUESTED_AT,
      unclearAnsweredAt: REQUESTED_AT,
    };
    const SETTLED_AT = new Date(REQUESTED_AT.getTime() + UNCLEAR_OUTCOME_SETTLING_DELAY_MS);

    it("adopts the credit note the tax authority holds at its number, without calling it again", async () => {
      const { store, taxAuthority, creditNotes, ports } = scenario({
        standing: REQUESTED,
        now: SETTLED_AT,
        voucher: { kind: "found", voucher: CREDIT_NOTE_VOUCHER },
      });

      expect(await issue(ports)).toEqual({
        kind: "adopted",
        pointOfSale: 12,
        number: 42,
        issuedOn: ISSUE_DAY,
        authorizationCode: "75123456789055",
        authorizationCodeDueOn: "2026-10-12",
      });
      expect(taxAuthority.voucherLookups).toEqual([
        { pointOfSale: 12, voucherType: 13, number: 42 },
      ]);
      expect(store.authorizations).toEqual([
        {
          creditNoteId: CREDIT_NOTE_ID,
          authorizationCode: "75123456789055",
          authorizationCodeDueOn: "2026-10-12",
          authorizedAt: SETTLED_AT,
        },
      ]);
      expect(creditNotes.solicitations).toEqual([]);
    });

    it("releases the number and requests again with a new number when the tax authority never reached it", async () => {
      const { store, creditNotes, ports } = scenario({
        standing: REQUESTED,
        now: SETTLED_AT,
        lastAuthorized: { kind: "read", number: 41 },
      });

      expect(await issue(ports)).toMatchObject({ kind: "authorized", number: 42 });
      expect(store.operations).toEqual([
        "enterLane",
        "creditNote",
        "validToken",
        "voucherAt",
        "lastAuthorized",
        "releaseCreditNoteRequest",
        "otherCreditNoteStandings",
        "lastAuthorized",
        "recordCreditNoteRequest",
        "solicit",
        "recordCreditNoteAuthorized",
        "leaveLane",
      ]);
      expect(creditNotes.solicitations).toHaveLength(1);
    });

    it("releases its own number but takes no new one while another credit note of the point of sale awaits its answer", async () => {
      const { store, creditNotes, ports } = scenario({
        standing: REQUESTED,
        now: SETTLED_AT,
        lastAuthorized: { kind: "read", number: 41 },
        others: [{ pointOfSale: 12, standing: { ...REQUESTED, number: 43 } }],
      });

      expect(await issue(ports)).toEqual({
        kind: "retry",
        askAgainAt: new Date(SETTLED_AT.getTime() + UNCLEAR_OUTCOME_REASK_INTERVAL_MS),
      });
      expect(store.releases).toEqual([{ creditNoteId: CREDIT_NOTE_ID, regularization: null }]);
      expect(store.requests).toEqual([]);
      expect(creditNotes.solicitations).toEqual([]);
    });

    it("renumbers after a different voucher took the number", async () => {
      const { creditNotes, ports } = scenario({
        standing: REQUESTED,
        now: SETTLED_AT,
        voucher: { kind: "found", voucher: { ...CREDIT_NOTE_VOUCHER, total: 1 } },
        lastAuthorized: { kind: "read", number: 42 },
      });

      await issue(ports);

      expect(creditNotes.solicitations[0]?.number).toBe(43);
    });

    it("records the voucher it did not issue as invoicing outside the register, together with the release of its number", async () => {
      const { store, ports } = scenario({
        standing: REQUESTED,
        now: SETTLED_AT,
        voucher: { kind: "found", voucher: { ...CREDIT_NOTE_VOUCHER, total: 1 } },
        lastAuthorized: { kind: "read", number: 42 },
      });

      await issue(ports);

      expect(store.releases).toEqual([
        {
          creditNoteId: CREDIT_NOTE_ID,
          regularization: {
            kind: "external_invoicing",
            externalBilling: { pointOfSale: 12, documentType: "credit_note_c", number: 42 },
            task: {
              kind: "external_invoicing",
              state: "open",
              pointOfSale: 12,
              documentType: "credit_note_c",
              number: 42,
              voucher: { issuedOn: ISSUE_DAY, total: 1, authorizationCode: "75123456789055" },
              createdAt: SETTLED_AT,
            },
          },
        },
      ]);
    });

    it("records no invoicing outside the register when the number is released with no voucher at it", async () => {
      const { store, ports } = scenario({
        standing: REQUESTED,
        now: SETTLED_AT,
        lastAuthorized: { kind: "read", number: 41 },
      });

      await issue(ports);

      expect(store.releases).toEqual([{ creditNoteId: CREDIT_NOTE_ID, regularization: null }]);
    });

    it("asks again later when the tax authority has reached the number but shows no credit note there", async () => {
      const { store, creditNotes, ports } = scenario({
        standing: REQUESTED,
        now: SETTLED_AT,
        lastAuthorized: { kind: "read", number: 42 },
      });

      expect(await issue(ports)).toEqual({
        kind: "retry",
        askAgainAt: new Date(SETTLED_AT.getTime() + UNCLEAR_OUTCOME_REASK_INTERVAL_MS),
      });
      expect(store.operations).not.toContain("releaseCreditNoteRequest");
      expect(creditNotes.solicitations).toEqual([]);
    });

    it("asks the tax authority nothing before the request settled", async () => {
      const { taxAuthority, ports } = scenario({
        standing: REQUESTED,
        now: new Date(SETTLED_AT.getTime() - 1),
      });

      expect(await issue(ports)).toEqual({ kind: "retry", askAgainAt: SETTLED_AT });
      expect(taxAuthority.voucherLookups).toEqual([]);
    });

    it("settles a request interrupted before any answer from the moment it was recorded", async () => {
      const { ports } = scenario({
        standing: { ...REQUESTED, unclearAnsweredAt: null },
        now: SETTLED_AT,
        voucher: { kind: "found", voucher: CREDIT_NOTE_VOUCHER },
      });

      expect(await issue(ports)).toMatchObject({ kind: "adopted" });
    });

    it("asks again later without a token", async () => {
      const { ports } = scenario({ standing: REQUESTED, now: SETTLED_AT, token: null });

      expect(await issue(ports)).toEqual({
        kind: "retry",
        askAgainAt: new Date(SETTLED_AT.getTime() + UNCLEAR_OUTCOME_REASK_INTERVAL_MS),
      });
    });
  });
});

describe("creditNoteAnswerOf", () => {
  const AUTHORIZED = {
    pointOfSale: 12,
    number: 42,
    issuedOn: ISSUE_DAY,
    authorizationCode: "75123456789099",
    authorizationCodeDueOn: "2026-10-12",
  };

  it.each(["authorized", "adopted", "already_authorized"] as const)(
    "is the authorized credit note when the issuance ended %s",
    (kind) => {
      expect(creditNoteAnswerOf({ kind, ...AUTHORIZED })).toEqual({
        kind: "authorized",
        ...AUTHORIZED,
      });
    },
  );

  it.each<IssueCreditNoteOutcome>([
    { kind: "rejected", rejections: [] },
    { kind: "already_rejected" },
  ])("is a rejection when the issuance ended %j", (outcome) => {
    expect(creditNoteAnswerOf(outcome)).toEqual({ kind: "rejected" });
  });

  it("is in progress while the issuance has to be tried again", () => {
    expect(creditNoteAnswerOf({ kind: "retry", askAgainAt: NOW })).toEqual({
      kind: "in_progress",
    });
  });

  it("is no answer for a credit note the cloud does not know", () => {
    expect(creditNoteAnswerOf({ kind: "not_found" })).toBeNull();
  });
});

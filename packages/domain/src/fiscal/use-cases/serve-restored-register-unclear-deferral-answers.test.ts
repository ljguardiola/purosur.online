import { describe, expect, it } from "vitest";
import type { RealTimeAuthorizationAnswer } from "../model/real-time-authorization.js";
import type { UnclearOutcomeDecision } from "../model/unclear-outcome-decision.js";
import { serveRestoredRegisterUnclearDeferralAnswers } from "./serve-restored-register-unclear-deferral-answers.js";
import {
  FakeRestoredRegisterUnclearDeferralAnswers,
  type StoredUnclearOutcome,
} from "./test-support/fake-restored-register-unclear-deferral-answers.js";

const REGISTER = "register-1";
const ANSWERED_AT = new Date("2026-10-08T15:00:00.000Z");
const DECIDED_AT = new Date("2026-10-08T16:30:00.000Z");

function anOutcome(
  fiscalDocumentId: string,
  answer: RealTimeAuthorizationAnswer | null,
  decision: UnclearOutcomeDecision | null = null,
  overrides: Partial<StoredUnclearOutcome> = {},
): StoredUnclearOutcome {
  return {
    registerId: REGISTER,
    fiscalDocumentId,
    outcome: { answer, decision },
    answeredAt: answer === null ? null : ANSWERED_AT,
    decidedAt: decision === null ? null : DECIDED_AT,
    ...overrides,
  };
}

function aCloud(outcomes: StoredUnclearOutcome[]) {
  const unclearDeferrals = new FakeRestoredRegisterUnclearDeferralAnswers();
  unclearDeferrals.outcomes = outcomes;
  return unclearDeferrals;
}

function serve(unclearDeferrals: FakeRestoredRegisterUnclearDeferralAnswers, ids: string[]) {
  return serveRestoredRegisterUnclearDeferralAnswers(
    { unclearDeferrals },
    { registerId: REGISTER, fiscalDocumentIds: ids },
  );
}

describe("serveRestoredRegisterUnclearDeferralAnswers", () => {
  it("answers with the authorization the tax authority gave a document", async () => {
    const cloud = aCloud([
      anOutcome("document-1", {
        kind: "authorized",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-18",
      }),
    ]);

    await expect(serve(cloud, ["document-1"])).resolves.toEqual([
      {
        fiscalDocumentId: "document-1",
        answer: {
          kind: "authorized",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-18",
          answeredAt: ANSWERED_AT,
        },
      },
    ]);
  });

  it("answers with the rejection of a document the tax authority rejected", async () => {
    const cloud = aCloud([
      anOutcome("document-1", { kind: "rejected", codes: [10015], rejectionClass: "content" }),
    ]);

    await expect(serve(cloud, ["document-1"])).resolves.toEqual([
      { fiscalDocumentId: "document-1", answer: { kind: "rejected" } },
    ]);
  });

  it("answers with the authorization the cloud adopted for a document it found authorized", async () => {
    const cloud = aCloud([
      anOutcome(
        "document-1",
        { kind: "unclear" },
        {
          kind: "adopted",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-18",
        },
      ),
    ]);

    await expect(serve(cloud, ["document-1"])).resolves.toEqual([
      {
        fiscalDocumentId: "document-1",
        answer: {
          kind: "authorized",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-18",
          answeredAt: DECIDED_AT,
        },
      },
    ]);
  });

  it.each([
    ["is still unclear", { kind: "unclear" } as const, null],
    ["was never attempted", { kind: "not_attempted" } as const, null],
    ["has no answer yet", null, null],
    ["was released", { kind: "unclear" } as const, { kind: "released" } as const],
    ["was found conflicting", { kind: "unclear" } as const, { kind: "conflicting" } as const],
  ])("answers unsettled for a document that %s", async (_case, answer, decision) => {
    const cloud = aCloud([anOutcome("document-1", answer, decision)]);

    await expect(serve(cloud, ["document-1"])).resolves.toEqual([
      { fiscalDocumentId: "document-1", answer: { kind: "unsettled" } },
    ]);
  });

  it("answers unsettled for a document the cloud never asked the tax authority about", async () => {
    await expect(serve(aCloud([]), ["document-1"])).resolves.toEqual([
      { fiscalDocumentId: "document-1", answer: { kind: "unsettled" } },
    ]);
  });

  it("answers once for each document asked, in the order asked", async () => {
    const cloud = aCloud([
      anOutcome("document-2", { kind: "rejected", codes: [10015], rejectionClass: "content" }),
      anOutcome("document-1", { kind: "unclear" }),
    ]);

    const served = await serve(cloud, ["document-2", "document-3", "document-1", "document-2"]);

    expect(served.map(({ fiscalDocumentId, answer }) => [fiscalDocumentId, answer.kind])).toEqual([
      ["document-2", "rejected"],
      ["document-3", "unsettled"],
      ["document-1", "unsettled"],
    ]);
  });

  it("reads only the outcomes of the register asking, never another register's", async () => {
    const cloud = aCloud([
      anOutcome(
        "document-1",
        {
          kind: "authorized",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-18",
        },
        null,
        { registerId: "register-2" },
      ),
    ]);

    await expect(serve(cloud, ["document-1"])).resolves.toEqual([
      { fiscalDocumentId: "document-1", answer: { kind: "unsettled" } },
    ]);
    expect(cloud.reads).toEqual([{ registerId: REGISTER, fiscalDocumentIds: ["document-1"] }]);
  });

  it("reads nothing when no document is asked about", async () => {
    const cloud = aCloud([]);

    await expect(serve(cloud, [])).resolves.toEqual([]);
    expect(cloud.reads).toEqual([]);
  });
});

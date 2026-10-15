import { describe, expect, it } from "vitest";
import type { Fortnight } from "../model/offline-authorization-code.js";
import { offlineDocument } from "./test-support/fake-fortnight-reports.js";
import {
  CLAIMED_AT,
  codeFor,
  KEY,
  OCTOBER_FIRST_HALF,
  ON_OCTOBER_3,
  ON_OCTOBER_20,
  POINT_OF_SALE,
  presentationOutcomes,
  REGISTER_ID,
  reachingInstallation,
  SEPTEMBER_SECOND_HALF,
  setUpReportFortnights as setUp,
  TOKEN,
} from "./test-support/report-fortnights.js";

describe("reportFortnights", () => {
  describe("without a valid token", () => {
    it("does nothing and records nothing", async () => {
      const { operations, declarations, codeAuthority, run } = setUp({ token: null });

      await expect(run()).resolves.toEqual({ kind: "no_token" });
      expect(operations).toEqual([]);
      expect(declarations.lookUps).toEqual([]);
      expect(declarations.declarations).toEqual([]);
      expect(codeAuthority.lookUps).toEqual([]);
    });
  });

  describe("declaring a fortnight with nothing to report", () => {
    it("asks the tax authority first, records the attempt before sending it, and records the acceptance", async () => {
      const { operations, declarations, run } = setUp();

      const result = await run();

      expect(presentationOutcomes(result)).toEqual([
        {
          pointOfSaleNumber: POINT_OF_SALE,
          fortnight: SEPTEMBER_SECOND_HALF,
          documentType: null,
          outcome: { kind: "accepted" },
        },
      ]);
      expect(operations).toEqual([
        "owedReports",
        `hold ${KEY}`,
        "tax authority lookUp",
        "installationsOf",
        "documentsOn",
        "record submitting",
        "tax authority declare",
        "record accepted",
        `release ${KEY}`,
        "acceptedWithUnreportedDocuments",
      ]);
      expect(declarations.declarations).toEqual([
        {
          token: TOKEN,
          pointOfSaleNumber: POINT_OF_SALE,
          code: "code-2026-09-16",
          heldDuringCall: true,
        },
      ]);
      expect(declarations.lookUps[0]?.heldDuringCall).toBe(true);
    });

    it("records the acceptance as a fortnight without movement", async () => {
      const { reports, run } = setUp();

      await run();

      expect(reports.changes.at(-1)?.change).toEqual({
        state: "accepted",
        at: ON_OCTOBER_3,
        movement: "none",
      });
    });

    it("stamps each record with the moment it was made", async () => {
      const { reports, run } = setUp();

      await run();

      expect(reports.changes.map(({ change }) => change.at)).toEqual([ON_OCTOBER_3, ON_OCTOBER_3]);
    });

    it("declares each point of sale of the fortnight separately", async () => {
      const { reports, streams, documents, declarations, run } = setUp();
      reports.pointsOfSale = [
        { pointOfSaleNumber: 7, registerId: REGISTER_ID, claimedAt: CLAIMED_AT },
        { pointOfSaleNumber: 8, registerId: "register-2", claimedAt: CLAIMED_AT },
        { pointOfSaleNumber: 9, registerId: "register-3", claimedAt: CLAIMED_AT },
      ];
      streams.installations.set("register-2", [reachingInstallation()]);
      streams.installations.set("register-3", [reachingInstallation({ latestOccurredAt: null })]);
      documents.add(7, SEPTEMBER_SECOND_HALF, offlineDocument(1), offlineDocument(2));

      const result = await run();

      expect(
        presentationOutcomes(result).map(({ pointOfSaleNumber, documentType, outcome }) => [
          pointOfSaleNumber,
          documentType,
          outcome.kind,
        ]),
      ).toEqual([
        [7, "factura_c", "accepted"],
        [8, null, "accepted"],
        [9, null, "blocked"],
      ]);
      expect(declarations.declarations.map(({ pointOfSaleNumber }) => pointOfSaleNumber)).toEqual([
        8,
      ]);
    });

    it("declares a presentation whose deadline has passed all the same", async () => {
      const { declarations, run } = setUp({ now: ON_OCTOBER_20 });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "accepted" });
      expect(declarations.declarations).toHaveLength(1);
    });

    it("declares a presentation that was blocked once its proof is there", async () => {
      const { reports, declarations, run } = setUp();
      reports.seed(
        { pointOfSaleNumber: POINT_OF_SALE, fortnight: SEPTEMBER_SECOND_HALF },
        { state: "blocked", movement: null, lastAttemptAt: new Date("2026-10-02T12:00:00.000Z") },
      );

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "accepted" });
      expect(declarations.declarations).toHaveLength(1);
    });

    it("leaves out a presentation the tax authority already accepted", async () => {
      const { reports, operations, run } = setUp();
      reports.seed(
        { pointOfSaleNumber: POINT_OF_SALE, fortnight: SEPTEMBER_SECOND_HALF },
        { state: "accepted", movement: "none", lastAttemptAt: new Date("2026-10-02T12:00:00.000Z") },
      );

      const result = await run();

      expect(presentationOutcomes(result)).toEqual([]);
      expect(operations).toEqual(["owedReports", "acceptedWithUnreportedDocuments"]);
    });

    it("owes nothing for a fortnight that has not closed", async () => {
      const { codeStore, declarations, run } = setUp();
      codeStore.kept.push({
        code: codeFor(OCTOBER_FIRST_HALF),
        obtainedAt: new Date("2026-09-28T12:00:00.000Z"),
        obtainedThrough: "requested",
      });

      const result = await run();

      expect(presentationOutcomes(result).map(({ fortnight }) => fortnight)).toEqual([
        SEPTEMBER_SECOND_HALF,
      ]);
      expect(declarations.declarations).toHaveLength(1);
    });
  });

  describe("a declaration the tax authority already holds", () => {
    it("is recorded as accepted without being sent again", async () => {
      const { operations, declarations, run } = setUp();
      declarations.lookUpAnswer = () => ({ kind: "held" });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "already_declared" });
      expect(operations).toEqual([
        "owedReports",
        `hold ${KEY}`,
        "tax authority lookUp",
        "record accepted",
        `release ${KEY}`,
        "acceptedWithUnreportedDocuments",
      ]);
      expect(declarations.declarations).toEqual([]);
    });

    it("is settled even when the tax authority's deadline has passed", async () => {
      const { declarations, run } = setUp({ now: ON_OCTOBER_20 });
      declarations.lookUpAnswer = () => ({ kind: "held" });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "already_declared" });
    });
  });

  describe("when the tax authority cannot tell whether it holds the declaration", () => {
    it("sends nothing and records nothing when it gives no answer", async () => {
      const { operations, declarations, run } = setUp();
      declarations.lookUpAnswer = () => ({ kind: "no_answer" });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "lookup_no_answer" });
      expect(declarations.declarations).toEqual([]);
      expect(operations.filter((operation) => operation.startsWith("record"))).toEqual([]);
    });

    it("sends nothing and records nothing when it refuses the question", async () => {
      const { operations, declarations, run } = setUp();
      const rejections = [{ code: 600, message: "Token invalid" }];
      declarations.lookUpAnswer = () => ({ kind: "refused", rejections });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({
        kind: "lookup_refused",
        rejections,
      });
      expect(declarations.declarations).toEqual([]);
      expect(operations.filter((operation) => operation.startsWith("record"))).toEqual([]);
    });
  });

  describe("a point of sale with offline-authorized documents in the fortnight", () => {
    it("is never declared as having had nothing", async () => {
      const { documents, declarations, reports, run } = setUp();
      documents.add(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, offlineDocument(1));

      await run();

      expect(declarations.declarations).toEqual([]);
      expect(reports.changes.map(({ change }) => change.movement)).not.toContain("none");
    });

    it("stays undeclared however late it is", async () => {
      const { documents, declarations, run } = setUp({ now: ON_OCTOBER_20 });
      documents.add(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, offlineDocument(1), offlineDocument(2));

      await run();

      expect(declarations.declarations).toEqual([]);
    });

    it("has its documents read only once the register's stream is proven to reach past the close, so none applied meanwhile is missed", async () => {
      const { operations, run } = setUp();

      await run();

      expect(operations.indexOf("tax authority lookUp")).toBeLessThan(
        operations.indexOf("installationsOf"),
      );
      expect(operations.indexOf("installationsOf")).toBeLessThan(
        operations.indexOf("documentsOn"),
      );
      expect(operations.indexOf("documentsOn")).toBeLessThan(
        operations.indexOf("tax authority declare"),
      );
    });

    it("is never declared as having had nothing when a document is applied while its stream is being proven", async () => {
      const { documents, streams, declarations, run } = setUp();
      const proveReach = streams.installationsOf.bind(streams);
      streams.installationsOf = async (registerId) => {
        documents.add(POINT_OF_SALE, SEPTEMBER_SECOND_HALF, offlineDocument(1));
        return proveReach(registerId);
      };

      await run();

      expect(declarations.declarations).toEqual([]);
    });
  });

  describe("without proof that the register's stream reaches past the fortnight's close", () => {
    it("records the presentation as blocked and declares nothing", async () => {
      const { reports, streams, operations, declarations, run } = setUp();
      streams.installations.set(REGISTER_ID, [
        reachingInstallation({ latestOccurredAt: new Date("2026-09-29T12:00:00.000Z") }),
      ]);

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "blocked" });
      expect(reports.changes.map(({ change }) => change.state)).toEqual(["blocked"]);
      expect(declarations.declarations).toEqual([]);
      expect(operations).not.toContain("record submitting");
    });

    it("blocks when a revoked installation of the register stopped before the close", async () => {
      const { streams, declarations, run } = setUp();
      streams.installations.set(REGISTER_ID, [
        reachingInstallation(),
        reachingInstallation({
          revokedAt: new Date("2026-09-25T12:00:00.000Z"),
          latestOccurredAt: new Date("2026-09-24T12:00:00.000Z"),
        }),
      ]);

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "blocked" });
      expect(declarations.declarations).toEqual([]);
    });

    it("blocks when the register never synced an event", async () => {
      const { streams, run } = setUp();
      streams.installations.set(REGISTER_ID, [reachingInstallation({ latestOccurredAt: null })]);

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "blocked" });
    });

    it("blocks a presentation past its deadline the same way", async () => {
      const { streams, declarations, run } = setUp({ now: ON_OCTOBER_20 });
      streams.installations.set(REGISTER_ID, [reachingInstallation({ latestOccurredAt: null })]);

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "blocked" });
      expect(declarations.declarations).toEqual([]);
    });
  });

  describe("when the tax authority refuses the declaration", () => {
    it("records the refusal with its rejections after having recorded the attempt", async () => {
      const { reports, declarations, run } = setUp();
      const rejections = [{ code: 15004, message: "Periodo invalido" }];
      declarations.declareAnswer = () => ({ kind: "refused", rejections });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "refused", rejections });
      expect(reports.changes.map(({ change }) => change.state)).toEqual(["submitting", "refused"]);
      expect(reports.changes[1]?.change.rejections).toEqual(rejections);
    });

    it("is not tried again before the retry interval has passed", async () => {
      const { reports, declarations, operations, run } = setUp();
      reports.seed(
        { pointOfSaleNumber: POINT_OF_SALE, fortnight: SEPTEMBER_SECOND_HALF },
        { state: "refused", movement: null, lastAttemptAt: new Date("2026-10-03T14:30:00.000Z") },
      );

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "retry_not_due" });
      expect(declarations.lookUps).toEqual([]);
      expect(declarations.declarations).toEqual([]);
      expect(operations.filter((operation) => operation.startsWith("record"))).toEqual([]);
    });

    it("is tried again once the retry interval has passed", async () => {
      const { reports, declarations, run } = setUp();
      reports.seed(
        { pointOfSaleNumber: POINT_OF_SALE, fortnight: SEPTEMBER_SECOND_HALF },
        { state: "refused", movement: null, lastAttemptAt: new Date("2026-10-03T13:59:00.000Z") },
      );

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "accepted" });
      expect(declarations.declarations).toHaveLength(1);
    });
  });

  describe("when the tax authority's answer to the declaration does not arrive", () => {
    it("leaves the presentation submitting and reports it unclear", async () => {
      const { reports, declarations, run } = setUp();
      declarations.declareAnswer = () => ({ kind: "no_answer" });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "unclear" });
      expect(reports.changes.map(({ change }) => change.state)).toEqual(["submitting"]);
    });

    it("is settled by asking the tax authority on the next run, never by sending blindly", async () => {
      const { declarations, reports, run } = setUp();
      declarations.declareAnswer = () => ({ kind: "no_answer" });
      await run();
      declarations.declareAnswer = () => ({ kind: "accepted" });
      declarations.lookUpAnswer = () => ({ kind: "held" });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "already_declared" });
      expect(declarations.declarations).toHaveLength(1);
      expect(reports.changes.map(({ change }) => change.state)).toEqual(["submitting", "accepted"]);
    });

    it("is declared again on the next run only once the tax authority says it does not hold it", async () => {
      const { declarations, run } = setUp();
      declarations.declareAnswer = () => ({ kind: "no_answer" });
      await run();
      declarations.declareAnswer = () => ({ kind: "accepted" });

      const result = await run();

      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "accepted" });
      expect(declarations.declarations).toHaveLength(2);
    });
  });

  describe("recovering a code that was never kept", () => {
    const recoveredAnswer = (fortnight: Fortnight) => ({
      kind: "granted" as const,
      code: codeFor(fortnight),
    });

    it("looks up the most recently closed fortnight's code and keeps it as recovered, then declares it", async () => {
      const { codeStore, codeAuthority, declarations, run } = setUp({ keptCode: false });
      codeAuthority.lookUpAnswer = recoveredAnswer;

      const result = await run();

      expect(codeAuthority.lookUps.map(({ fortnight }) => fortnight)).toEqual([
        SEPTEMBER_SECOND_HALF,
      ]);
      expect(codeAuthority.lookUps[0]?.heldDuringCall).toBe(true);
      expect(codeStore.kept).toEqual([
        {
          code: codeFor(SEPTEMBER_SECOND_HALF),
          obtainedAt: ON_OCTOBER_3,
          obtainedThrough: "recovered",
        },
      ]);
      expect(presentationOutcomes(result)[0]?.outcome).toEqual({ kind: "accepted" });
      expect(declarations.declarations[0]?.code).toBe("code-2026-09-16");
    });

    it("owes nothing when the tax authority never granted one", async () => {
      const { codeStore, codeAuthority, declarations, run } = setUp({ keptCode: false });
      codeAuthority.lookUpAnswer = () => ({ kind: "not_granted" });

      const result = await run();

      expect(presentationOutcomes(result)).toEqual([]);
      expect(codeStore.kept).toEqual([]);
      expect(declarations.lookUps).toEqual([]);
    });

    it("keeps nothing and owes nothing when the lookup is refused or unanswered", async () => {
      const { codeStore, codeAuthority, run } = setUp({ keptCode: false });
      codeAuthority.lookUpAnswer = () => ({
        kind: "refused",
        rejections: [{ code: 600, message: "Token invalid" }],
      });
      expect(presentationOutcomes(await run())).toEqual([]);
      codeAuthority.lookUpAnswer = () => ({ kind: "no_answer" });
      expect(presentationOutcomes(await run())).toEqual([]);
      expect(codeStore.kept).toEqual([]);
    });

    it("keeps nothing when the code it was granted is for another fortnight", async () => {
      const { codeStore, codeAuthority, run } = setUp({ keptCode: false });
      codeAuthority.lookUpAnswer = () => recoveredAnswer(OCTOBER_FIRST_HALF);

      await run();

      expect(codeStore.kept).toEqual([]);
    });

    it("does not look up a code that is already kept", async () => {
      const { codeAuthority, run } = setUp();

      await run();

      expect(codeAuthority.lookUps).toEqual([]);
    });

    it("does not look up a code once the eighth day after the close has passed", async () => {
      const { codeAuthority, run } = setUp({
        keptCode: false,
        now: new Date("2026-10-09T15:00:00.000Z"),
      });

      await run();

      expect(codeAuthority.lookUps).toEqual([]);
    });

    it("still looks it up on the eighth day after the close", async () => {
      const { codeAuthority, run } = setUp({
        keptCode: false,
        now: new Date("2026-10-08T15:00:00.000Z"),
      });

      await run();

      expect(codeAuthority.lookUps).toHaveLength(1);
    });

    it("does not look up a code when no offline point of sale is configured", async () => {
      const { codeStore, codeAuthority, run } = setUp({ keptCode: false });
      codeStore.offlinePointOfSaleConfigured = false;

      await run();

      expect(codeAuthority.lookUps).toEqual([]);
    });

    it("recovers the fortnight that closed last, also on the first day of the next one", async () => {
      const { codeAuthority, run } = setUp({
        keptCode: false,
        now: new Date("2026-10-16T15:00:00.000Z"),
      });

      await run();

      expect(codeAuthority.lookUps.map(({ fortnight }) => fortnight)).toEqual([OCTOBER_FIRST_HALF]);
    });
  });
});

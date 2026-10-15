import type { InstallationStreamReach } from "../../../sync/index.js";
import type { Fortnight } from "../../model/offline-authorization-code.js";
import type { OfflineAuthorizationCode } from "../offline-authorization-code-ports.js";
import { reportFortnights } from "../report-fortnights.js";
import { ManualClock } from "./fake-arca-vitality.js";
import {
  FakeFortnightReportStore,
  FakeOfflineDocumentsOfFortnight,
  FakeRegisterEventStreams,
  FakeTaxAuthorityNoMovementDeclarations,
  FakeTaxAuthorityOfflineDocumentReports,
} from "./fake-fortnight-reports.js";
import {
  FakeOfflineAuthorizationCodeStore,
  FakeTaxAuthorityOfflineAuthorizationCodes,
} from "./fake-offline-authorization-codes.js";

export const TOKEN = {
  token: "token",
  sign: "sign",
  issuedAt: new Date("2026-10-03T08:00:00.000Z"),
  expiresAt: new Date("2026-10-03T20:00:00.000Z"),
};
export const SEPTEMBER_FIRST_HALF: Fortnight = { start: "2026-09-01", end: "2026-09-15" };
export const SEPTEMBER_SECOND_HALF: Fortnight = { start: "2026-09-16", end: "2026-09-30" };
export const OCTOBER_FIRST_HALF: Fortnight = { start: "2026-10-01", end: "2026-10-15" };
export const ON_OCTOBER_3 = new Date("2026-10-03T15:00:00.000Z");
export const ON_OCTOBER_20 = new Date("2026-10-20T15:00:00.000Z");
export const REGISTER_ID = "register-1";
export const POINT_OF_SALE = 7;
export const CLAIMED_AT = new Date("2026-09-01T12:00:00.000Z");
export const KEY = `${POINT_OF_SALE}:${SEPTEMBER_SECOND_HALF.start}`;

export function codeFor(fortnight: Fortnight): OfflineAuthorizationCode {
  return { code: `code-${fortnight.start}`, fortnight, reportDeadline: "2026-10-05" };
}

export function reachingInstallation(
  overrides: Partial<InstallationStreamReach> = {},
): InstallationStreamReach {
  return {
    enrolledAt: new Date("2026-01-01T12:00:00.000Z"),
    revokedAt: null,
    latestOccurredAt: new Date("2026-10-02T12:00:00.000Z"),
    caughtUpAt: null,
    holdsUnappliedEvents: false,
    ...overrides,
  };
}

export function setUpReportFortnights({
  now = ON_OCTOBER_3,
  token = TOKEN as typeof TOKEN | null,
  keptCode = true,
} = {}) {
  const operations: string[] = [];
  const codeStore = new FakeOfflineAuthorizationCodeStore();
  const codeAuthority = new FakeTaxAuthorityOfflineAuthorizationCodes(codeStore);
  if (keptCode) {
    codeStore.kept.push({
      code: codeFor(SEPTEMBER_SECOND_HALF),
      obtainedAt: new Date("2026-09-12T12:00:00.000Z"),
      obtainedThrough: "requested",
    });
  }
  const documents = new FakeOfflineDocumentsOfFortnight(operations);
  const reports = new FakeFortnightReportStore(codeStore, documents, operations);
  reports.pointsOfSale = [
    { pointOfSaleNumber: POINT_OF_SALE, registerId: REGISTER_ID, claimedAt: CLAIMED_AT },
  ];
  const streams = new FakeRegisterEventStreams(operations);
  streams.installations.set(REGISTER_ID, [reachingInstallation()]);
  const declarations = new FakeTaxAuthorityNoMovementDeclarations(reports, operations);
  const documentReports = new FakeTaxAuthorityOfflineDocumentReports(reports, operations);
  const clock = new ManualClock(now);
  const run = () =>
    reportFortnights({
      reports,
      documents,
      streams,
      declarations,
      documentReports,
      codeStore,
      codeAuthority,
      tokens: { validToken: async () => token },
      clock,
    });
  return {
    operations,
    codeStore,
    codeAuthority,
    reports,
    documents,
    streams,
    declarations,
    documentReports,
    clock,
    run,
  };
}

export function presentationOutcomes(result: Awaited<ReturnType<typeof reportFortnights>>) {
  if (result.kind !== "reported") {
    throw new Error(`expected a reported result, got ${result.kind}`);
  }
  return result.presentations.map(({ pointOfSaleNumber, fortnight, documentType, outcome }) => ({
    pointOfSaleNumber,
    fortnight,
    documentType,
    outcome,
  }));
}

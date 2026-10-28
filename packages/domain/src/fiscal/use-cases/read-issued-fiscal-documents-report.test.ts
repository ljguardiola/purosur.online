import { describe, expect, it } from "vitest";
import {
  FakeZoneRulesSource,
  fixedOffsetZoneRules,
} from "../../shared/test-support/fake-zone-rules-source.js";
import type { IssuedDocumentGroup } from "../model/issued-fiscal-documents-report.js";
import { readIssuedFiscalDocumentsReport } from "./read-issued-fiscal-documents-report.js";
import { FakeIssuedFiscalDocumentsReportReader } from "./test-support/fake-issued-fiscal-documents-report-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };

const receiptGroup: IssuedDocumentGroup = {
  kind: "receipt",
  voucherType: 11,
  pointOfSale: 7,
  authorizationKind: "cae",
  count: 2,
  amount: 6_000,
};

describe("readIssuedFiscalDocumentsReport", () => {
  it("reads the groups of the branch for the range and register asked and answers with the range", async () => {
    const reader = new FakeIssuedFiscalDocumentsReportReader();

    const report = await readIssuedFiscalDocumentsReport(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      {
        locationId: "branch-1",
        asked: { from: "2026-10-01", to: "2026-10-06" },
        registerId: "register-1",
      },
    );

    expect(report.range).toEqual({ from: "2026-10-01", to: "2026-10-06" });
    expect(reader.reads).toEqual([
      {
        locationId: "branch-1",
        range: { from: "2026-10-01", to: "2026-10-06" },
        registerId: "register-1",
      },
    ]);
  });

  it("answers today's Argentine day when no range is asked", async () => {
    const reader = new FakeIssuedFiscalDocumentsReportReader();

    const report = await readIssuedFiscalDocumentsReport(
      {
        zoneRules: new FakeZoneRulesSource(),
        reader,
        clock: { now: () => new Date("2026-10-07T02:30:00.000Z") },
      },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("answers today on the calendar of the zone rules it is given when no range is asked", async () => {
    const reader = new FakeIssuedFiscalDocumentsReportReader();

    const report = await readIssuedFiscalDocumentsReport(
      {
        zoneRules: new FakeZoneRulesSource(fixedOffsetZoneRules(0)),
        reader,
        clock: { now: () => new Date("2026-10-07T02:30:00.000Z") },
      },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.range).toEqual({ from: "2026-10-07", to: "2026-10-07" });
  });

  it("builds the rows and totals of the groups read", async () => {
    const reader = new FakeIssuedFiscalDocumentsReportReader([
      receiptGroup,
      { ...receiptGroup, kind: "credit_note", voucherType: 13, count: 1, amount: 1_000 },
    ]);

    const report = await readIssuedFiscalDocumentsReport(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: noRange, registerId: undefined },
    );

    expect(report.rows.map((row) => row.amount)).toEqual([6_000, -1_000]);
    expect(report.totals.amount).toBe(5_000);
  });
});

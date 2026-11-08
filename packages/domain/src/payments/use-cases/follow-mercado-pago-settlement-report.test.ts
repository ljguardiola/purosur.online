import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import { followMercadoPagoSettlementReport } from "./follow-mercado-pago-settlement-report.js";
import type { SettlementReportRow } from "./mercado-pago-settlement-report-ports.js";
import { FakeMercadoPagoSettlementReports } from "./test-support/fake-mercado-pago-settlement-reports.js";
import { FakeSettlementReportStore } from "./test-support/fake-settlement-report-store.js";

const NOW = new Date("2026-11-07T02:30:00.000Z");
const DAY = "2026-11-06";
const SIXTY_DAYS_BEFORE = new Date("2026-09-08T02:30:00.000Z");

function row(sourceId: string, transactionType: string): SettlementReportRow {
  return {
    sourceId,
    transactionType,
    transactionDate: new Date("2026-11-01T13:00:00Z"),
    grossAmount: 10_000,
    feeAmount: -340,
    financingFeeAmount: 0,
    taxesAmount: -120,
    netAmount: 9540,
    moneyReleaseDate: null,
    externalReference: null,
    paymentMethod: null,
    paymentMethodType: null,
  };
}

function setup() {
  const reports = new FakeMercadoPagoSettlementReports();
  const store = new FakeSettlementReportStore();
  const ports = {
    reports,
    store,
    clock: { now: () => NOW },
    zoneRules: new FakeZoneRulesSource(),
  };
  return { reports, store, ports };
}

function requestOfToday(
  store: FakeSettlementReportStore,
  overrides: { refused?: boolean; recordedAt?: Date | null } = {},
) {
  store.requests.set(DAY, {
    day: DAY,
    beginDate: SIXTY_DAYS_BEFORE,
    endDate: NOW,
    requestedAt: new Date("2026-11-06T20:00:00.000Z"),
    refused: overrides.refused ?? false,
    recordedAt: overrides.recordedAt ?? null,
  });
}

describe("followMercadoPagoSettlementReport", () => {
  describe("a day already recorded", () => {
    it("does nothing and does not call Mercado Pago", async () => {
      const { reports, store, ports } = setup();
      requestOfToday(store, { recordedAt: NOW });

      const outcome = await followMercadoPagoSettlementReport(ports);

      expect(outcome).toEqual({ kind: "already_recorded" });
      expect(reports.calls).toEqual([]);
      expect(store.writes).toEqual([]);
    });

    it("looks at the Argentine calendar day, not the UTC one", async () => {
      const { store, ports } = setup();
      store.requests.set("2026-11-07", {
        day: "2026-11-07",
        beginDate: SIXTY_DAYS_BEFORE,
        endDate: NOW,
        requestedAt: NOW,
        refused: false,
        recordedAt: NOW,
      });

      expect(await followMercadoPagoSettlementReport(ports)).toEqual({ kind: "requested" });
    });
  });

  describe("a day without request", () => {
    it("requests the longest window Mercado Pago allows, ending now, and records the request", async () => {
      const { reports, store, ports } = setup();

      const outcome = await followMercadoPagoSettlementReport(ports);

      expect(outcome).toEqual({ kind: "requested" });
      expect(reports.requestedWindows).toEqual([{ beginDate: SIXTY_DAYS_BEFORE, endDate: NOW }]);
      expect(store.requests.get(DAY)).toEqual({
        day: DAY,
        beginDate: SIXTY_DAYS_BEFORE,
        endDate: NOW,
        requestedAt: NOW,
        refused: false,
        recordedAt: null,
      });
    });

    it("creates the configuration when there is none", async () => {
      const { reports, ports } = setup();
      reports.configuration = { kind: "missing" };

      await followMercadoPagoSettlementReport(ports);

      expect(reports.calls).toEqual(["readConfiguration", "createConfiguration", "requestReport"]);
    });

    it("updates a configuration that lacks what the reading needs", async () => {
      const { reports, ports } = setup();
      reports.configuration = { kind: "outdated" };

      await followMercadoPagoSettlementReport(ports);

      expect(reports.calls).toEqual(["readConfiguration", "updateConfiguration", "requestReport"]);
    });

    it("reuses a found configuration without writing one", async () => {
      const { reports, ports } = setup();

      await followMercadoPagoSettlementReport(ports);

      expect(reports.calls).toEqual(["readConfiguration", "requestReport"]);
    });

    it.each([
      [
        "reading the configuration",
        (r: FakeMercadoPagoSettlementReports) => {
          r.configuration = { kind: "unavailable" };
        },
      ],
      [
        "creating the configuration",
        (r: FakeMercadoPagoSettlementReports) => {
          r.configuration = { kind: "missing" };
          r.creating = { kind: "unavailable" };
        },
      ],
      [
        "updating the configuration",
        (r: FakeMercadoPagoSettlementReports) => {
          r.configuration = { kind: "outdated" };
          r.updating = { kind: "unavailable" };
        },
      ],
      [
        "requesting the report",
        (r: FakeMercadoPagoSettlementReports) => {
          r.requesting = { kind: "unavailable" };
        },
      ],
    ])("records nothing when Mercado Pago is unavailable %s", async (_step, arrange) => {
      const { reports, store, ports } = setup();
      arrange(reports);

      const outcome = await followMercadoPagoSettlementReport(ports);

      expect(outcome).toEqual({ kind: "unavailable" });
      expect(store.writes).toEqual([]);
    });

    it("does not request a report when the configuration could not be written", async () => {
      const { reports, ports } = setup();
      reports.configuration = { kind: "missing" };
      reports.creating = { kind: "unavailable" };

      await followMercadoPagoSettlementReport(ports);

      expect(reports.calls).toEqual(["readConfiguration", "createConfiguration"]);
    });

    it("records a refused request so the generation is retried the next day", async () => {
      const { reports, store, ports } = setup();
      reports.requesting = { kind: "refused" };

      const outcome = await followMercadoPagoSettlementReport(ports);

      expect(outcome).toEqual({ kind: "refused" });
      expect(store.requests.get(DAY)).toMatchObject({ refused: true, recordedAt: null });
    });
  });

  describe("a day with a request not yet recorded", () => {
    it("does not follow a refused request for the rest of the day", async () => {
      const { reports, store, ports } = setup();
      requestOfToday(store, { refused: true });

      const outcome = await followMercadoPagoSettlementReport(ports);

      expect(outcome).toEqual({ kind: "refused" });
      expect(reports.calls).toEqual([]);
      expect(store.writes).toEqual([]);
    });

    it("waits while the report is not listed yet", async () => {
      const { reports, store, ports } = setup();
      requestOfToday(store);
      reports.listing = {
        kind: "listed",
        reports: [
          {
            fileName: "other.csv",
            beginDate: new Date("2026-09-01T00:00:00Z"),
            endDate: NOW,
            createdAt: NOW,
          },
        ],
      };

      const outcome = await followMercadoPagoSettlementReport(ports);

      expect(outcome).toEqual({ kind: "waiting" });
      expect(reports.calls).toEqual(["listReports"]);
      expect(store.writes).toEqual([]);
    });

    it("downloads the report that begins when the request began, keeps the charge movements and marks the day recorded", async () => {
      const { reports, store, ports } = setup();
      requestOfToday(store);
      reports.listing = {
        kind: "listed",
        reports: [
          {
            fileName: "mine.csv",
            beginDate: new Date(SIXTY_DAYS_BEFORE.getTime()),
            endDate: NOW,
            createdAt: NOW,
          },
        ],
      };
      reports.downloads.set("mine.csv", [
        row("1", "SETTLEMENT"),
        row("2", "PAYOUTS"),
        row("3", "REFUND"),
        row("4", "CHARGEBACK"),
        row("5", "DISPUTE"),
        row("6", "WITHDRAWAL"),
      ]);

      const outcome = await followMercadoPagoSettlementReport(ports);

      expect(outcome).toEqual({ kind: "recorded", rows: 4 });
      expect([...store.rows.keys()]).toEqual(["1", "3", "4", "5"]);
      expect(store.requests.get(DAY)?.recordedAt).toEqual(NOW);
    });

    it("downloads the newest of several reports with the same beginning", async () => {
      const { reports, store, ports } = setup();
      requestOfToday(store);
      const base = { beginDate: SIXTY_DAYS_BEFORE, endDate: NOW };
      reports.listing = {
        kind: "listed",
        reports: [
          { ...base, fileName: "newest.csv", createdAt: new Date("2026-11-06T22:00:00Z") },
          { ...base, fileName: "older.csv", createdAt: new Date("2026-11-06T21:00:00Z") },
          { ...base, fileName: "oldest.csv", createdAt: new Date("2026-11-06T20:00:00Z") },
        ],
      };

      await followMercadoPagoSettlementReport(ports);

      expect(reports.downloadedFiles).toEqual(["newest.csv"]);
    });

    it("downloads the newest when it is listed first and last alike", async () => {
      const { reports, store, ports } = setup();
      requestOfToday(store);
      const base = { beginDate: SIXTY_DAYS_BEFORE, endDate: NOW };
      reports.listing = {
        kind: "listed",
        reports: [
          { ...base, fileName: "older.csv", createdAt: new Date("2026-11-06T21:00:00Z") },
          { ...base, fileName: "newest.csv", createdAt: new Date("2026-11-06T22:00:00Z") },
        ],
      };

      await followMercadoPagoSettlementReport(ports);

      expect(reports.downloadedFiles).toEqual(["newest.csv"]);
    });

    it("downloads the first listed of several reports created at the same instant", async () => {
      const { reports, store, ports } = setup();
      requestOfToday(store);
      const same = {
        beginDate: SIXTY_DAYS_BEFORE,
        endDate: NOW,
        createdAt: new Date("2026-11-06T22:00:00Z"),
      };
      reports.listing = {
        kind: "listed",
        reports: [
          { ...same, fileName: "first.csv" },
          { ...same, fileName: "second.csv" },
        ],
      };

      await followMercadoPagoSettlementReport(ports);

      expect(reports.downloadedFiles).toEqual(["first.csv"]);
    });

    it("records nothing when the listing is unavailable", async () => {
      const { reports, store, ports } = setup();
      requestOfToday(store);
      reports.listing = { kind: "unavailable" };

      const outcome = await followMercadoPagoSettlementReport(ports);

      expect(outcome).toEqual({ kind: "unavailable" });
      expect(store.writes).toEqual([]);
    });

    it("records nothing when the download is unavailable", async () => {
      const { reports, store, ports } = setup();
      requestOfToday(store);
      reports.listing = {
        kind: "listed",
        reports: [
          { fileName: "mine.csv", beginDate: SIXTY_DAYS_BEFORE, endDate: NOW, createdAt: NOW },
        ],
      };
      reports.downloadUnavailable = true;

      const outcome = await followMercadoPagoSettlementReport(ports);

      expect(outcome).toEqual({ kind: "unavailable" });
      expect(store.writes).toEqual([]);
    });
  });
});

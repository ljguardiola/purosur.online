import { expect, test } from "vitest";
import { snapshotGenerationDate, snapshotTierCaptions } from "./snapshot-backups-text";

test("writes a generation's moment in Argentina as day, month, year and the hour", () => {
  expect(snapshotGenerationDate("2026-09-16T15:55:00.000Z")).toBe("16/09/2026 12:55");
});

test("writes the hours past midnight in Argentina on the day they belong to", () => {
  expect(snapshotGenerationDate("2026-09-17T02:05:00.000Z")).toBe("16/09/2026 23:05");
  expect(snapshotGenerationDate("2026-09-17T03:00:00.000Z")).toBe("17/09/2026 00:00");
});

test("captions each tier with how far back the rules keep it", () => {
  expect(snapshotTierCaptions({ hourly: 24, daily: 30, monthly: 12 })).toEqual({
    hourly: "Últimas 24 horas",
    daily: "Últimos 30 días",
    monthly: "Hasta 12 meses",
  });
});

test("captions a tier kept for one unit in the singular", () => {
  expect(snapshotTierCaptions({ hourly: 1, daily: 1, monthly: 1 })).toEqual({
    hourly: "Última hora",
    daily: "Último día",
    monthly: "Hasta 1 mes",
  });
});

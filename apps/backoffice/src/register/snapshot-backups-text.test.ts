import { expect, test } from "vitest";
import {
  SNAPSHOT_LOCATION_TEXT,
  snapshotGenerationDate,
  snapshotRecentCaption,
  snapshotTierCaptions,
} from "./snapshot-backups-text";

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

test("captions the recent tier with how many of the newest generations it keeps", () => {
  expect(snapshotRecentCaption(6)).toBe("Las 6 más nuevas");
});

test("captions a recent tier that keeps one generation in the singular", () => {
  expect(snapshotRecentCaption(1)).toBe("La más nueva");
});

test("names each place a generation can be kept in so it reads after Dónde", () => {
  expect(SNAPSHOT_LOCATION_TEXT).toEqual({
    disk_and_bucket: "Disco y bucket",
    bucket: "Solo bucket",
    disk: "Solo disco",
    nowhere: "En ningún lado",
  });
});

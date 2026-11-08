import { expect, test } from "vitest";
import { stockRecords } from "./stock-records";
import {
  almondsAdjustment,
  almondsCount,
  honeyCount,
  honeyLoss,
} from "./test-support/stock-fixtures";

test("lists counts, adjustments and losses together, the latest first", () => {
  const records = stockRecords([honeyCount, almondsCount], [almondsAdjustment, honeyLoss]);

  expect(records.map((record) => [record.kind, record.occurredAt])).toEqual([
    ["loss", honeyLoss.occurredAt],
    ["count", almondsCount.occurredAt],
    ["adjustment", almondsAdjustment.occurredAt],
    ["count", honeyCount.occurredAt],
  ]);
});

test("keeps what a count says about its expected and counted quantities", () => {
  const [record] = stockRecords([almondsCount], []);

  expect(record).toMatchObject({
    kind: "count",
    delta: almondsCount.delta,
    saleUnit: almondsCount.saleUnit,
    detail: { kind: "count", expected: almondsCount.expected, counted: almondsCount.counted },
  });
});

test("keeps the reason of a movement", () => {
  const [record] = stockRecords([], [honeyLoss]);

  expect(record).toMatchObject({
    kind: "loss",
    detail: { kind: "movement", reason: "broken_or_spilled" },
  });
});

test("tells a count and a movement with the same id apart", () => {
  const records = stockRecords([{ ...almondsCount, id: "same" }], [{ ...honeyLoss, id: "same" }]);

  expect(new Set(records.map((record) => record.id)).size).toBe(2);
});

test("lists nothing when there is nothing", () => {
  expect(stockRecords([], [])).toEqual([]);
});

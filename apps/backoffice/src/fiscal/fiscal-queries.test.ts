import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { fiscalKey, fiscalKeys, readBuyerIdentificationThresholdsOnDay } from "./fiscal-queries";

test("invalidating the fiscal key marks the issuer identification stale and leaves other concepts alone", async () => {
  const client = new QueryClient();
  client.setQueryData(fiscalKeys.issuerIdentification, {});
  client.setQueryData(["catalog", "categories"], []);

  await client.invalidateQueries({ queryKey: fiscalKey, refetchType: "none" });

  expect(client.getQueryState(fiscalKeys.issuerIdentification)?.isInvalidated).toBe(true);
  expect(client.getQueryState(["catalog", "categories"])?.isInvalidated).toBe(false);
});

test("invalidating the fiscal key marks the buyer-identification thresholds stale too", async () => {
  const client = new QueryClient();
  client.setQueryData(fiscalKeys.buyerIdentificationThresholds, []);

  await client.invalidateQueries({ queryKey: fiscalKey, refetchType: "none" });

  expect(client.getQueryState(fiscalKeys.buyerIdentificationThresholds)?.isInvalidated).toBe(true);
});

const threshold = { id: "threshold-1", amount: 1_000_000_000, validFrom: "2026-01-01" };

test("a thresholds read carries the Argentina calendar day of the clock at the moment it loads", async () => {
  let current = new Date("2026-12-01T01:00:00Z");
  const read = readBuyerIdentificationThresholdsOnDay(
    () => Promise.resolve({ kind: "ok", value: [threshold] }),
    () => current,
  );

  expect(await read()).toEqual({
    kind: "ok",
    value: { thresholds: [threshold], today: "2026-11-30" },
  });
  current = new Date("2026-12-02T12:00:00-03:00");
  expect(await read()).toEqual({
    kind: "ok",
    value: { thresholds: [threshold], today: "2026-12-02" },
  });
});

test("a refused thresholds read passes through without a day", async () => {
  const read = readBuyerIdentificationThresholdsOnDay(
    () => Promise.resolve({ kind: "rate_limited", retryAfterSeconds: 30 }),
    () => new Date("2026-10-15T12:00:00-03:00"),
  );

  expect(await read()).toEqual({ kind: "rate_limited", retryAfterSeconds: 30 });
});

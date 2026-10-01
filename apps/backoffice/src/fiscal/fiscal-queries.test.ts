import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { fiscalKey, fiscalKeys } from "./fiscal-queries";

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

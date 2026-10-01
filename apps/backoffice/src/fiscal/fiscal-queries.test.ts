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

test("invalidating the fiscal key marks the fiscal addresses and the registers' points of sale stale too", async () => {
  const client = new QueryClient();
  client.setQueryData(fiscalKeys.fiscalAddresses, []);
  client.setQueryData(fiscalKeys.registerPointsOfSale, []);

  await client.invalidateQueries({ queryKey: fiscalKey, refetchType: "none" });

  expect(client.getQueryState(fiscalKeys.fiscalAddresses)?.isInvalidated).toBe(true);
  expect(client.getQueryState(fiscalKeys.registerPointsOfSale)?.isInvalidated).toBe(true);
});

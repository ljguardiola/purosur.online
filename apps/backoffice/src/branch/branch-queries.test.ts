import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { branchKey, branchKeys } from "./branch-queries";

test("invalidating the branch key marks the settings stale and leaves other concepts alone", async () => {
  const client = new QueryClient();
  client.setQueryData(branchKeys.settings, {});
  client.setQueryData(["catalog", "categories"], []);

  await client.invalidateQueries({ queryKey: branchKey, refetchType: "none" });

  expect(client.getQueryState(branchKeys.settings)?.isInvalidated).toBe(true);
  expect(client.getQueryState(["catalog", "categories"])?.isInvalidated).toBe(false);
});

test("invalidating the branch key marks the terms read for the screens stale too", async () => {
  const client = new QueryClient();
  client.setQueryData(branchKeys.goodConditionReturnDays, 15);
  client.setQueryData(branchKeys.supplierPriceListDailyCap, 10);

  await client.invalidateQueries({ queryKey: branchKey, refetchType: "none" });

  expect(client.getQueryState(branchKeys.goodConditionReturnDays)?.isInvalidated).toBe(true);
  expect(client.getQueryState(branchKeys.supplierPriceListDailyCap)?.isInvalidated).toBe(true);
});

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

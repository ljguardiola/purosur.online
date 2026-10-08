import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { paymentsKey, paymentsKeys } from "./payments-queries";

test("invalidating the payments key marks every payments read stale", async () => {
  const client = new QueryClient();
  client.setQueryData(paymentsKeys.pendingRefunds, []);
  client.setQueryData(["sales"], []);

  await client.invalidateQueries({ queryKey: paymentsKey, refetchType: "none" });

  expect(client.getQueryState(paymentsKeys.pendingRefunds)?.isInvalidated).toBe(true);
  expect(client.getQueryState(["sales"])?.isInvalidated).toBe(false);
});

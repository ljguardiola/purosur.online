import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { paymentsKey, paymentsKeys } from "./payments-queries";

test("invalidating the payments key marks every payments read stale", async () => {
  const client = new QueryClient();
  client.setQueryData(paymentsKeys.pendingRefunds, []);
  client.setQueryData(paymentsKeys.salesByPaymentMethod({}), []);
  client.setQueryData(["sales"], []);

  await client.invalidateQueries({ queryKey: paymentsKey, refetchType: "none" });

  expect(client.getQueryState(paymentsKeys.pendingRefunds)?.isInvalidated).toBe(true);
  expect(client.getQueryState(paymentsKeys.salesByPaymentMethod({}))?.isInvalidated).toBe(true);
  expect(client.getQueryState(["sales"])?.isInvalidated).toBe(false);
});

test("each range and register has its own sales by payment method key", () => {
  const keys = [
    paymentsKeys.salesByPaymentMethod({}),
    paymentsKeys.salesByPaymentMethod({ from: "2026-10-01", to: "2026-10-07" }),
    paymentsKeys.salesByPaymentMethod({ from: "2026-10-01", to: "2026-10-08" }),
    paymentsKeys.salesByPaymentMethod({ register_id: FRONT_REGISTER_ID }),
    paymentsKeys.salesByPaymentMethod({
      from: "2026-10-01",
      to: "2026-10-07",
      register_id: FRONT_REGISTER_ID,
    }),
  ];

  expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
});

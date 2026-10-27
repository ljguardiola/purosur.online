import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { returnsKey, returnsKeys } from "./returns-queries";

test("invalidating the returns key marks the returns report stale", async () => {
  const client = new QueryClient();
  client.setQueryData(returnsKeys.report({}), []);
  client.setQueryData(["sales"], []);

  await client.invalidateQueries({ queryKey: returnsKey, refetchType: "none" });

  expect(client.getQueryState(returnsKeys.report({}))?.isInvalidated).toBe(true);
  expect(client.getQueryState(["sales"])?.isInvalidated).toBe(false);
});

test("each range and register has its own returns report key", () => {
  const keys = [
    returnsKeys.report({}),
    returnsKeys.report({ from: "2026-10-01", to: "2026-10-07" }),
    returnsKeys.report({ from: "2026-10-01", to: "2026-10-08" }),
    returnsKeys.report({ from: "2026-09-30", to: "2026-10-07" }),
    returnsKeys.report({ register_id: FRONT_REGISTER_ID }),
    returnsKeys.report({ from: "2026-10-01", to: "2026-10-07", register_id: FRONT_REGISTER_ID }),
  ];

  expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
});

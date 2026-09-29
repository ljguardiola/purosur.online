import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { alertsKey, alertsKeys } from "./alerts-queries";

test("invalidating the alerts key marks every alerts list, detail and the overview stale, whatever they were asked for", async () => {
  const client = new QueryClient();
  const keys = [
    alertsKeys.overview,
    alertsKeys.list({ open: true, page: 1 }),
    alertsKeys.list({ level: "critical", open: false, page: 2 }),
    alertsKeys.detail("alert-1"),
    alertsKeys.detail("alert-2"),
  ];
  for (const key of keys) {
    client.setQueryData(key, {});
  }
  client.setQueryData(["other"], {});

  await client.invalidateQueries({ queryKey: alertsKey, refetchType: "none" });

  for (const key of keys) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  }
  expect(client.getQueryState(["other"])?.isInvalidated).toBe(false);
});

test("each list query and each alert has its own key, so one answer cannot land in another's data", () => {
  const first = { open: true, page: 1 };

  expect(alertsKeys.list(first)).not.toEqual(alertsKeys.list({ ...first, page: 2 }));
  expect(alertsKeys.list(first)).not.toEqual(alertsKeys.list({ ...first, level: "warning" }));
  expect(alertsKeys.list(first)).not.toEqual(
    alertsKeys.list({ ...first, search: { text: "a", kinds: [] } }),
  );
  expect(alertsKeys.detail("alert-1")).not.toEqual(alertsKeys.detail("alert-2"));
  expect(alertsKeys.list(first)).not.toEqual(alertsKeys.detail("alert-1"));
});

test("the lists key covers every alerts list, whatever it was asked for, and no alert's detail", () => {
  const client = new QueryClient();
  const lists = [
    alertsKeys.list({ open: true, page: 1 }),
    alertsKeys.list({ level: "critical", open: false, page: 2 }),
  ];
  for (const key of [...lists, alertsKeys.detail("alert-1")]) {
    client.setQueryData(key, {});
  }

  const covered = client.getQueryCache().findAll({ queryKey: alertsKeys.lists });

  expect(covered.map((query) => query.queryKey)).toEqual(lists);
});

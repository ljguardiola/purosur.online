import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { syncKey, syncKeys } from "./sync-queries";

test("invalidating the sync key marks the quarantined events stale and leaves other concepts alone", async () => {
  const client = new QueryClient();
  client.setQueryData(syncKeys.quarantinedEvents, { events: [] });
  client.setQueryData(["alerts"], []);

  await client.invalidateQueries({ queryKey: syncKey, refetchType: "none" });

  expect(client.getQueryState(syncKeys.quarantinedEvents)?.isInvalidated).toBe(true);
  expect(client.getQueryState(["alerts"])?.isInvalidated).toBe(false);
});

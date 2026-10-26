import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { backupsKey, backupsKeys } from "./backups-queries";

test("invalidating the backups key marks the ticket recoveries stale and leaves other concepts alone", async () => {
  const client = new QueryClient();
  client.setQueryData(backupsKeys.contingencyTicketRecoveries, { recoveries: [] });
  client.setQueryData(["alerts"], []);

  await client.invalidateQueries({ queryKey: backupsKey, refetchType: "none" });

  expect(client.getQueryState(backupsKeys.contingencyTicketRecoveries)?.isInvalidated).toBe(true);
  expect(client.getQueryState(["alerts"])?.isInvalidated).toBe(false);
});

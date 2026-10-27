import { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, test, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { backupsKey, backupsKeys, useContingencyTicketRecoveriesQuery } from "./backups-queries";
import type { fetchContingencyTicketRecoveries } from "./contingency-ticket-recovery-api";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function RecoveriesProbe({ read }: { read: typeof fetchContingencyTicketRecoveries }) {
  const data = useContingencyTicketRecoveriesQuery({
    fetchContingencyTicketRecoveries: read,
    onSessionEnded: () => {},
  });
  return <p>{data.status}</p>;
}

test("invalidating the backups key marks the ticket recoveries stale and leaves other concepts alone", async () => {
  const client = new QueryClient();
  client.setQueryData(backupsKeys.contingencyTicketRecoveries, { recoveries: [] });
  client.setQueryData(["alerts"], []);

  await client.invalidateQueries({ queryKey: backupsKey, refetchType: "none" });

  expect(client.getQueryState(backupsKeys.contingencyTicketRecoveries)?.isInvalidated).toBe(true);
  expect(client.getQueryState(["alerts"])?.isInvalidated).toBe(false);
});

test("sends the person to Mi cuenta when the ticket recoveries come back forbidden", async () => {
  window.history.pushState(null, "", "/rescue");
  const read = vi
    .fn<typeof fetchContingencyTicketRecoveries>()
    .mockResolvedValue({ kind: "forbidden" });

  await render(<RecoveriesProbe read={read} />);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

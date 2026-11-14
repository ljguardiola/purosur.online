import type { DiscardContingencyBackupTicketsAnswer } from "@purosur/contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { createQueryClient } from "../platform/query-client";
import { useDiscardContingencyBackupTickets } from "./backups-queries";

function DiscardProbe({
  discard,
}: {
  discard: () => Promise<DiscardContingencyBackupTicketsAnswer>;
}) {
  const run = useDiscardContingencyBackupTickets(discard);
  return (
    <button type="button" onClick={run}>
      discard
    </button>
  );
}

function renderProbe(discard: () => Promise<DiscardContingencyBackupTicketsAnswer>) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <DiscardProbe discard={discard} />
    </QueryClientProvider>,
  );
}

describe("backups queries", () => {
  it("send no second discard while the first is still out", async () => {
    const discard = vi.fn(() => new Promise<DiscardContingencyBackupTicketsAnswer>(() => {}));
    const screen = await renderProbe(discard);

    await userEvent.dblClick(screen.getByRole("button", { name: "discard" }));

    expect(discard).toHaveBeenCalledOnce();
  });

  it("send the discard again once the first is answered", async () => {
    const discard = vi.fn(
      async (): Promise<DiscardContingencyBackupTicketsAnswer> => ({
        kind: "unavailable",
      }),
    );
    const screen = await renderProbe(discard);

    await userEvent.click(screen.getByRole("button", { name: "discard" }));
    await vi.waitFor(() => expect(discard).toHaveBeenCalledOnce());
    await userEvent.click(screen.getByRole("button", { name: "discard" }));

    await vi.waitFor(() => expect(discard).toHaveBeenCalledTimes(2));
  });
});

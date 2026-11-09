import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { renderHook } from "vitest-browser-react";
import { installationKey, installationKeys, useRefreshInstallation } from "./installation-queries";

test("invalidating the installation key marks the registers list, their coverage, their last sync and the registers a report filters by stale and leaves other concepts alone", async () => {
  const client = new QueryClient();
  client.setQueryData(installationKeys.registers, []);
  client.setQueryData(installationKeys.coverage, []);
  client.setQueryData(installationKeys.syncStatus, []);
  client.setQueryData(installationKeys.reportRegisters, []);
  client.setQueryData(["catalog", "categories"], []);

  await client.invalidateQueries({ queryKey: installationKey, refetchType: "none" });

  expect(client.getQueryState(installationKeys.registers)?.isInvalidated).toBe(true);
  expect(client.getQueryState(installationKeys.coverage)?.isInvalidated).toBe(true);
  expect(client.getQueryState(installationKeys.syncStatus)?.isInvalidated).toBe(true);
  expect(client.getQueryState(installationKeys.reportRegisters)?.isInvalidated).toBe(true);
  expect(client.getQueryState(["catalog", "categories"])?.isInvalidated).toBe(false);
});

test("refreshing the installation marks its registers list stale and leaves every other concept alone", async () => {
  const client = new QueryClient();
  client.setQueryData(installationKeys.registers, []);
  client.setQueryData(["register", "snapshot-backups", "register-1"], {});
  const { result } = await renderHook(() => useRefreshInstallation(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });

  await result.current();

  expect(client.getQueryState(installationKeys.registers)?.isInvalidated).toBe(true);
  expect(client.getQueryState(["register", "snapshot-backups", "register-1"])?.isInvalidated).toBe(
    false,
  );
});

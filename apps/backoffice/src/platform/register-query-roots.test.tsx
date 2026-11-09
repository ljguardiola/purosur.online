import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useRefreshRegisters } from "./register-query-roots";

test("refreshing the registers marks the installation and register queries stale and leaves other concepts alone", async () => {
  const client = new QueryClient();
  client.setQueryData(["installation", "registers"], []);
  client.setQueryData(["register", "snapshot-backups", "register-1"], {});
  client.setQueryData(["catalog", "categories"], []);
  const { result } = await renderHook(() => useRefreshRegisters(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });

  await result.current();

  expect(client.getQueryState(["installation", "registers"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["register", "snapshot-backups", "register-1"])?.isInvalidated).toBe(
    true,
  );
  expect(client.getQueryState(["catalog", "categories"])?.isInvalidated).toBe(false);
});

import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { registerKey, registerKeys } from "./register-queries";

test("invalidating the register key marks the registers list, their coverage, their last sync, the registers a report filters by, the registers whose backups are read and each register's backups stale and leaves other concepts alone", async () => {
  const client = new QueryClient();
  client.setQueryData(registerKeys.registers, []);
  client.setQueryData(registerKeys.coverage, []);
  client.setQueryData(registerKeys.syncStatus, []);
  client.setQueryData(registerKeys.reportRegisters, []);
  client.setQueryData(registerKeys.snapshotBackupRegisters, []);
  client.setQueryData(registerKeys.snapshotBackups("register-1"), {});
  client.setQueryData(["catalog", "categories"], []);

  await client.invalidateQueries({ queryKey: registerKey, refetchType: "none" });

  expect(client.getQueryState(registerKeys.registers)?.isInvalidated).toBe(true);
  expect(client.getQueryState(registerKeys.coverage)?.isInvalidated).toBe(true);
  expect(client.getQueryState(registerKeys.syncStatus)?.isInvalidated).toBe(true);
  expect(client.getQueryState(registerKeys.reportRegisters)?.isInvalidated).toBe(true);
  expect(client.getQueryState(registerKeys.snapshotBackupRegisters)?.isInvalidated).toBe(true);
  expect(client.getQueryState(registerKeys.snapshotBackups("register-1"))?.isInvalidated).toBe(
    true,
  );
  expect(client.getQueryState(["catalog", "categories"])?.isInvalidated).toBe(false);
});

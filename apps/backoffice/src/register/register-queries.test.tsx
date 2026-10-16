import { QueryClient } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { registerKey, registerKeys, useSnapshotBackupsQuery } from "./register-queries";
import type { fetchSnapshotBackups } from "./snapshot-backups-api";
import { backups } from "./test-support/snapshot-backups-screen";

function SnapshotBackupsProbe({
  registerId,
  read,
}: {
  registerId: string | undefined;
  read: typeof fetchSnapshotBackups;
}) {
  const data = useSnapshotBackupsQuery({
    registerId,
    fetchSnapshotBackups: read,
    onSessionEnded: () => {},
  });
  return <p>{data.status === "loaded" ? `${data.value.tiers.recent} recientes` : data.status}</p>;
}

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

test("reads no backups while no register is chosen", async () => {
  const read = vi
    .fn<typeof fetchSnapshotBackups>()
    .mockResolvedValue({ kind: "ok", value: backups });

  const screen = await render(<SnapshotBackupsProbe registerId={undefined} read={read} />);

  await expect.element(screen.getByText("loading")).toBeVisible();
  expect(read).not.toHaveBeenCalled();
});

test("reads the backups of the chosen register", async () => {
  const read = vi
    .fn<typeof fetchSnapshotBackups>()
    .mockResolvedValue({ kind: "ok", value: backups });

  const screen = await render(<SnapshotBackupsProbe registerId="register-1" read={read} />);

  await expect.element(screen.getByText("5 recientes")).toBeVisible();
  expect(read).toHaveBeenCalledExactlyOnceWith("register-1");
});

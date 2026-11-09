import { QueryClient } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import { registerKey } from "../platform/register-query-roots";
import { render } from "../shell/test-support/render-with-router";
import { registerKeys, useSnapshotBackupsQuery } from "./register-queries";
import type { fetchSnapshotBackups } from "./snapshot-backups-api";
import { backups } from "./test-support/snapshot-backups-section";

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

test("invalidating the register key marks each register's backups stale and leaves other concepts alone", async () => {
  const client = new QueryClient();
  client.setQueryData(registerKeys.snapshotBackups("register-1"), {});
  client.setQueryData(["catalog", "categories"], []);

  await client.invalidateQueries({ queryKey: registerKey, refetchType: "none" });

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

test("each range and register has its own cash session closes key", () => {
  const keys = [
    registerKeys.cashSessionCloses({}),
    registerKeys.cashSessionCloses({ from: "2026-10-01", to: "2026-10-07" }),
    registerKeys.cashSessionCloses({ from: "2026-10-01", to: "2026-10-08" }),
    registerKeys.cashSessionCloses({ register_id: "register-1" }),
    registerKeys.cashSessionCloses({
      from: "2026-10-01",
      to: "2026-10-07",
      register_id: "register-1",
    }),
  ];

  expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
});

test("invalidating the register key marks the cash session closes stale", async () => {
  const client = new QueryClient();
  client.setQueryData(registerKeys.cashSessionCloses({}), {});

  await client.invalidateQueries({ queryKey: registerKey, refetchType: "none" });

  expect(client.getQueryState(registerKeys.cashSessionCloses({}))?.isInvalidated).toBe(true);
});

test.each([
  { part: "start", changed: { from: "2026-10-02" } },
  { part: "end", changed: { to: "2026-10-08" } },
  { part: "register", changed: { register_id: "register-2" } },
])("a report differing only in its $part has its own cash movements key", ({ changed }) => {
  const query = { from: "2026-10-01", to: "2026-10-07", register_id: "register-1" };

  expect(registerKeys.cashMovements({ ...query, ...changed })).not.toEqual(
    registerKeys.cashMovements(query),
  );
});

test("invalidating the register key marks the cash movements stale", async () => {
  const client = new QueryClient();
  client.setQueryData(registerKeys.cashMovements({}), {});

  await client.invalidateQueries({ queryKey: registerKey, refetchType: "none" });

  expect(client.getQueryState(registerKeys.cashMovements({}))?.isInvalidated).toBe(true);
});

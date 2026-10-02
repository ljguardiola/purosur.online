import postgres from "postgres";
import { expect, inject, it } from "vitest";

function filesystemHolding(path: string, mounts: string): string | undefined {
  const holding = mounts
    .split("\n")
    .map((line) => line.split(" "))
    .filter(([, mountPoint]) => mountPoint !== undefined && isWithin(path, mountPoint))
    .sort(([, a], [, b]) => (b?.length ?? 0) - (a?.length ?? 0));
  return holding[0]?.[2];
}

function isWithin(path: string, mountPoint: string): boolean {
  return mountPoint === "/" || path === mountPoint || path.startsWith(`${mountPoint}/`);
}

it("keeps the cluster's data in memory, so creating and dropping databases never waits on a busy disk", async () => {
  const admin = postgres(inject("recoveryPostgresAdminUrl"), { max: 1 });
  try {
    const [row] = await admin<{ dataDirectory: string; mounts: string }[]>`
      SELECT current_setting('data_directory') AS "dataDirectory",
        pg_read_file('/proc/self/mounts') AS mounts
    `;
    expect(filesystemHolding(row?.dataDirectory ?? "", row?.mounts ?? "")).toBe("tmpfs");
  } finally {
    await admin.end({ timeout: 1 });
  }
});

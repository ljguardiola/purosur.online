import { describe, expect, it } from "vitest";
import { syncUnlessRestorePending } from "./restore-sync-hold";

describe("syncUnlessRestorePending", () => {
  it("syncs as usual when no restore is pending", async () => {
    const synced: string[] = [];
    const sync = syncUnlessRestorePending(
      () => false,
      () => synced.push("restore"),
      async () => {
        synced.push("sync");
        return { kind: "failed", retryAfterMs: 5 };
      },
    );

    expect(await sync()).toEqual({ kind: "failed", retryAfterMs: 5 });
    expect(synced).toEqual(["sync"]);
  });

  it("attempts the restore instead of pulling, pushing or checking the installation while a restore is pending", async () => {
    const synced: string[] = [];
    const sync = syncUnlessRestorePending(
      () => true,
      () => synced.push("restore"),
      async () => {
        synced.push("sync");
        return { kind: "succeeded" };
      },
    );

    expect(await sync()).toEqual({ kind: "succeeded" });
    expect(synced).toEqual(["restore"]);
  });

  it("syncs again as soon as the restore is no longer pending", async () => {
    let pending = true;
    const synced: string[] = [];
    const sync = syncUnlessRestorePending(
      () => pending,
      () => synced.push("restore"),
      async () => {
        synced.push("sync");
        return { kind: "succeeded" };
      },
    );
    await sync();

    pending = false;
    await sync();

    expect(synced).toEqual(["restore", "sync"]);
  });
});

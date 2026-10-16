import { describe, expect, it } from "vitest";
import { SNAPSHOT_LOCATIONS, snapshotLocation } from "./snapshot-location.js";

describe("SNAPSHOT_LOCATIONS", () => {
  it("names the places a generation can be kept", () => {
    expect(SNAPSHOT_LOCATIONS).toEqual(["disk_and_bucket", "bucket", "disk", "nowhere"]);
  });
});

describe("snapshotLocation", () => {
  it.each(["uploaded", "verified"] as const)(
    "puts a %s generation still on the register's disk on the disk and in the bucket",
    (status) => {
      expect(snapshotLocation({ status, failureReason: null, onRegisterDisk: true })).toBe(
        "disk_and_bucket",
      );
    },
  );

  it.each(["uploaded", "verified"] as const)(
    "puts a %s generation gone from the register's disk in the bucket only",
    (status) => {
      expect(snapshotLocation({ status, failureReason: null, onRegisterDisk: false })).toBe(
        "bucket",
      );
    },
  );

  it.each(["hash_mismatch", "size_mismatch"] as const)(
    "keeps the object of a generation that failed by %s in the bucket",
    (failureReason) => {
      expect(snapshotLocation({ status: "failed", failureReason, onRegisterDisk: false })).toBe(
        "bucket",
      );
      expect(snapshotLocation({ status: "failed", failureReason, onRegisterDisk: true })).toBe(
        "disk_and_bucket",
      );
    },
  );

  it("puts a generation declared but not yet uploaded on the disk only", () => {
    expect(
      snapshotLocation({ status: "declared", failureReason: null, onRegisterDisk: true }),
    ).toBe("disk");
  });

  it("puts a generation that never uploaded on the disk only while the disk holds it", () => {
    expect(
      snapshotLocation({ status: "failed", failureReason: "never_uploaded", onRegisterDisk: true }),
    ).toBe("disk");
    expect(
      snapshotLocation({
        status: "failed",
        failureReason: "never_uploaded",
        onRegisterDisk: false,
      }),
    ).toBe("nowhere");
  });

  it("puts a declared generation gone from the disk nowhere", () => {
    expect(
      snapshotLocation({ status: "declared", failureReason: null, onRegisterDisk: false }),
    ).toBe("nowhere");
  });
});

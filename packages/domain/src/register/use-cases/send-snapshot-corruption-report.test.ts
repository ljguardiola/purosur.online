import { describe, expect, it } from "vitest";
import { sendSnapshotCorruptionReport } from "./send-snapshot-corruption-report.js";
import {
  FakeSnapshotCorruptionCloud,
  FakeSnapshotCorruptionReports,
} from "./test-support/fake-snapshot-corruption-reports.js";

function setup(pending?: "copy" | "integrity_check" | "foreign_key_check") {
  const reports = new FakeSnapshotCorruptionReports([], pending);
  const cloud = new FakeSnapshotCorruptionCloud();
  return { reports, cloud, send: () => sendSnapshotCorruptionReport({ reports, cloud }) };
}

describe("sendSnapshotCorruptionReport", () => {
  it("sends nothing when no report waits", async () => {
    const { send, cloud } = setup();

    expect(await send()).toEqual({ kind: "nothing_pending" });
    expect(cloud.reported).toEqual([]);
  });

  it("tells the cloud the stage that failed and settles the report once the cloud has it", async () => {
    const { send, cloud, reports } = setup("foreign_key_check");

    expect(await send()).toEqual({ kind: "reported", stage: "foreign_key_check" });
    expect(cloud.reported).toEqual(["foreign_key_check"]);
    expect(await reports.pending()).toBeUndefined();
  });

  it.each(["failed", "unreachable"] as const)(
    "keeps the report to send again when the cloud answers %s",
    async (answer) => {
      const { send, cloud, reports } = setup("copy");
      cloud.answer = answer;

      expect(await send()).toEqual({ kind: "kept", stage: "copy" });
      expect(await reports.pending()).toBe("copy");
    },
  );
});

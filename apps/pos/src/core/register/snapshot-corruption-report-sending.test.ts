import type { SnapshotCorruptionStage } from "@purosur/domain";
import type { SnapshotCorruptionReports } from "@purosur/domain/register/use-cases";
import { describe, expect, it } from "vitest";
import type { CloudClientDeps } from "../platform/cloud-client";
import { snapshotCorruptionReportSending } from "./snapshot-corruption-report-sending";

function pendingReport(stage: SnapshotCorruptionStage | undefined): SnapshotCorruptionReports & {
  stage: SnapshotCorruptionStage | undefined;
} {
  const reports = {
    stage,
    pending: async () => reports.stage,
    record: async (recorded: SnapshotCorruptionStage) => {
      reports.stage = recorded;
    },
    settle: async () => {
      reports.stage = undefined;
    },
  };
  return reports;
}

function cloudAnswering(status: number) {
  const requests: { url: string; init: RequestInit }[] = [];
  const cloudClient: CloudClientDeps = {
    cloudUrl: "https://cloud.test",
    fetch: async (url, init) => {
      requests.push({ url, init });
      return new Response(null, { status });
    },
    sleep: async () => undefined,
  };
  return { cloudClient, requests };
}

describe("snapshotCorruptionReportSending", () => {
  it("tells the cloud, with the device token, the stage still unreported and settles it", async () => {
    const reports = pendingReport("integrity_check");
    const { cloudClient, requests } = cloudAnswering(204);
    const send = snapshotCorruptionReportSending({
      reports,
      cloudClient,
      readDeviceToken: async () => "prefix.secret",
      reportFailure: () => undefined,
    });

    await send();

    expect(requests.map(({ url, init }) => [url, init.headers, init.body])).toEqual([
      [
        "https://cloud.test/api/devices/current/snapshot-corruption",
        { authorization: "Bearer prefix.secret", "content-type": "application/json" },
        JSON.stringify({ stage: "integrity_check" }),
      ],
    ]);
    expect(reports.stage).toBeUndefined();
  });

  it("keeps the report while no cloud is configured", async () => {
    const reports = pendingReport("copy");
    const send = snapshotCorruptionReportSending({
      reports,
      cloudClient: undefined,
      readDeviceToken: async () => "prefix.secret",
      reportFailure: () => undefined,
    });

    await send();

    expect(reports.stage).toBe("copy");
  });

  it("asks the cloud nothing while the register has no local data folder to keep reports in", async () => {
    const { cloudClient, requests } = cloudAnswering(204);
    const send = snapshotCorruptionReportSending({
      reports: undefined,
      cloudClient,
      readDeviceToken: async () => "prefix.secret",
      reportFailure: () => undefined,
    });

    await send();

    expect(requests).toEqual([]);
  });

  it("reports a failure to send instead of raising it, so the sync cycle goes on", async () => {
    const failure = new Error("the report could not be read");
    const failures: unknown[] = [];
    const send = snapshotCorruptionReportSending({
      reports: {
        ...pendingReport("copy"),
        pending: async () => {
          throw failure;
        },
      },
      cloudClient: cloudAnswering(204).cloudClient,
      readDeviceToken: async () => "prefix.secret",
      reportFailure: (error) => failures.push(error),
    });

    await expect(send()).resolves.toBeUndefined();
    expect(failures).toEqual([failure]);
  });
});

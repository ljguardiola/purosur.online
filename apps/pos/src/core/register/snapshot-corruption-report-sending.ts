import {
  type SnapshotCorruptionReports,
  sendSnapshotCorruptionReport,
} from "@purosur/domain/register/use-cases";
import { type CloudClientDeps, postToCloudWithBearer } from "../platform/cloud-client";
import { cloudSnapshotCorruption } from "./cloud-snapshot-corruption";

export function snapshotCorruptionReportSending(deps: {
  reports: SnapshotCorruptionReports | undefined;
  cloudClient: CloudClientDeps | undefined;
  readDeviceToken: () => Promise<string | undefined>;
  reportFailure: (error: unknown) => void;
}): () => Promise<void> {
  const { reports, cloudClient } = deps;
  if (reports === undefined || cloudClient === undefined) {
    return async () => undefined;
  }
  const cloud = cloudSnapshotCorruption({
    readDeviceToken: deps.readDeviceToken,
    post: (path, bearerToken, body) => postToCloudWithBearer(cloudClient, path, bearerToken, body),
  });
  return async () => {
    try {
      await sendSnapshotCorruptionReport({ reports, cloud });
    } catch (error) {
      deps.reportFailure(error);
    }
  };
}

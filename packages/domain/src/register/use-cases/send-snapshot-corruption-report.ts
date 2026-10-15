import type { SnapshotCorruptionStage } from "../model/snapshot-generation.js";
import type {
  SnapshotCorruptionCloud,
  SnapshotCorruptionReports,
} from "./snapshot-corruption-ports.js";

export interface SendSnapshotCorruptionReportPorts {
  reports: SnapshotCorruptionReports;
  cloud: SnapshotCorruptionCloud;
}

export type SendSnapshotCorruptionReportOutcome =
  | { kind: "nothing_pending" }
  | { kind: "reported"; stage: SnapshotCorruptionStage }
  | { kind: "kept"; stage: SnapshotCorruptionStage };

export async function sendSnapshotCorruptionReport({
  reports,
  cloud,
}: SendSnapshotCorruptionReportPorts): Promise<SendSnapshotCorruptionReportOutcome> {
  const stage = await reports.pending();
  if (stage === undefined) {
    return { kind: "nothing_pending" };
  }
  if ((await cloud.report(stage)) !== "done") {
    return { kind: "kept", stage };
  }
  await reports.settle();
  return { kind: "reported", stage };
}

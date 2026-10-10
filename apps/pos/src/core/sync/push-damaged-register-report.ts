import type { DeviceCredentials } from "@purosur/contracts";
import type { RegisterTelemetry } from "@purosur/domain";
import { CloudEventInbox, type PostToCloudWithBearer } from "./cloud-event-inbox";
import type { PushAttempt } from "./push-to-cloud";

export interface DamagedRegisterReportDeps {
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  post: PostToCloudWithBearer | undefined;
  appVersion: string | undefined;
  readTelemetry: () => Promise<RegisterTelemetry>;
}

export async function pushDamagedRegisterReport(
  deps: DamagedRegisterReportDeps,
): Promise<PushAttempt> {
  const { post, appVersion, readTelemetry } = deps;
  if (post === undefined) {
    return { kind: "no_cloud" };
  }
  if (appVersion === undefined) {
    return { kind: "no_app_version" };
  }
  const credentials = await deps.readCredentials();
  if (credentials === undefined) {
    return { kind: "not_enrolled" };
  }
  const answer = await new CloudEventInbox({
    post,
    deviceToken: credentials.device_token,
    appVersion,
    readTelemetry,
  }).push([]);
  switch (answer.kind) {
    case "received":
      return { kind: "up_to_date" };
    case "gap":
      return { kind: "gap", expectedSeq: answer.expectedSeq };
    case "stale_device":
      return { kind: "stale_device" };
    case "update_required":
      return { kind: "update_required" };
    case "revoked":
    case "failed":
      return answer;
  }
}

import type { SnapshotCorruptionBody } from "@purosur/contracts";
import type { SnapshotCorruptionCloud } from "@purosur/domain/register/use-cases";
import type { PostToCloudWithBearer } from "../sync/cloud-event-inbox";

const REPORT_PATH = "/api/devices/current/snapshot-corruption";

export function cloudSnapshotCorruption(deps: {
  readDeviceToken: () => Promise<string | undefined>;
  post: PostToCloudWithBearer;
}): SnapshotCorruptionCloud {
  return {
    report: async (stage) => {
      const token = await deps.readDeviceToken();
      if (token === undefined) {
        return "failed";
      }
      const body: SnapshotCorruptionBody = { stage };
      const answer = await deps.post(REPORT_PATH, token, body);
      if (answer.kind === "ok") {
        return "done";
      }
      return answer.kind === "unreachable" ? "unreachable" : "failed";
    },
  };
}

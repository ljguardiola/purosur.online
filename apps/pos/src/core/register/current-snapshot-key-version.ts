import { currentSnapshotKeyVersionAnswerSchema } from "@purosur/contracts";
import { type CloudClientDeps, getFromCloud } from "../platform/cloud-client";

const KEY_VERSION_PATH = "/api/devices/current/snapshot-key-version";

export async function cloudCurrentSnapshotKeyVersion(
  cloud: CloudClientDeps,
  deviceToken: string,
): Promise<number | undefined> {
  const answered = await getFromCloud(cloud, KEY_VERSION_PATH, {
    authorization: `Bearer ${deviceToken}`,
  });
  if (answered.kind !== "ok") {
    return undefined;
  }
  const answer = currentSnapshotKeyVersionAnswerSchema.safeParse(answered.body);
  return answer.success ? answer.data.current_key_version : undefined;
}

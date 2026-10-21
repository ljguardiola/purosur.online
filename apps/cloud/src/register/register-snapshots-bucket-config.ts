import {
  type BucketConfig,
  type BucketEnv,
  resolveBucketConfig,
} from "../platform/bucket-config.js";

export type RegisterSnapshotsBucketConfig = BucketConfig;

export function resolveRegisterSnapshotsBucketConfig(
  env: BucketEnv<"REGISTER_SNAPSHOTS">,
): RegisterSnapshotsBucketConfig | undefined {
  return resolveBucketConfig(env, "REGISTER_SNAPSHOTS");
}

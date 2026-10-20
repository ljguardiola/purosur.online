import { type BucketConfig, type BucketEnv, resolveBucketConfig } from "../platform/bucket-config.js";

export type RegisterUpdatesBucketConfig = BucketConfig;

export function resolveRegisterUpdatesBucketConfig(
  env: BucketEnv<"REGISTER_UPDATES">,
): RegisterUpdatesBucketConfig | undefined {
  return resolveBucketConfig(env, "REGISTER_UPDATES");
}

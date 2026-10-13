export interface RegisterUpdatesBucketConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const REGISTER_UPDATES_BUCKET_VARIABLES = [
  ["REGISTER_UPDATES_BUCKET_ENDPOINT", "endpoint"],
  ["REGISTER_UPDATES_BUCKET_NAME", "bucket"],
  ["REGISTER_UPDATES_BUCKET_REGION", "region"],
  ["REGISTER_UPDATES_BUCKET_ACCESS_KEY_ID", "accessKeyId"],
  ["REGISTER_UPDATES_BUCKET_SECRET_ACCESS_KEY", "secretAccessKey"],
] as const;

type RegisterUpdatesBucketEnv = {
  [Name in (typeof REGISTER_UPDATES_BUCKET_VARIABLES)[number][0]]?: string | undefined;
};

export function resolveRegisterUpdatesBucketConfig(
  env: RegisterUpdatesBucketEnv,
): RegisterUpdatesBucketConfig | undefined {
  const present = REGISTER_UPDATES_BUCKET_VARIABLES.filter(([name]) => env[name]);
  if (present.length === 0) {
    return undefined;
  }
  const missing = REGISTER_UPDATES_BUCKET_VARIABLES.find(([name]) => !env[name]);
  const [firstPresent] = present;
  if (missing && firstPresent) {
    throw new Error(`${missing[0]} must be set when ${firstPresent[0]} is set`);
  }
  return {
    endpoint: env.REGISTER_UPDATES_BUCKET_ENDPOINT ?? "",
    bucket: env.REGISTER_UPDATES_BUCKET_NAME ?? "",
    region: env.REGISTER_UPDATES_BUCKET_REGION ?? "",
    accessKeyId: env.REGISTER_UPDATES_BUCKET_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.REGISTER_UPDATES_BUCKET_SECRET_ACCESS_KEY ?? "",
  };
}

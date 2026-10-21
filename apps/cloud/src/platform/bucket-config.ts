export interface BucketConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const BUCKET_VARIABLE_FIELDS = [
  ["ENDPOINT", "endpoint"],
  ["NAME", "bucket"],
  ["REGION", "region"],
  ["ACCESS_KEY_ID", "accessKeyId"],
  ["SECRET_ACCESS_KEY", "secretAccessKey"],
] as const;

type BucketVariableSuffix = (typeof BUCKET_VARIABLE_FIELDS)[number][0];

export type BucketEnv<TPrefix extends string> = {
  [Suffix in BucketVariableSuffix as `${TPrefix}_BUCKET_${Suffix}`]?: string | undefined;
};

export function resolveBucketConfig<TPrefix extends string>(
  env: BucketEnv<TPrefix>,
  prefix: TPrefix,
): BucketConfig | undefined {
  const variables = BUCKET_VARIABLE_FIELDS.map(([suffix, field]) => ({
    name: `${prefix}_BUCKET_${suffix}`,
    field,
    value: (env as Record<string, string | undefined>)[`${prefix}_BUCKET_${suffix}`],
  }));
  const firstPresent = variables.find((variable) => variable.value);
  if (!firstPresent) {
    return undefined;
  }
  const missing = variables.find((variable) => !variable.value);
  if (missing) {
    throw new Error(`${missing.name} must be set when ${firstPresent.name} is set`);
  }
  return {
    endpoint: variables[0]?.value ?? "",
    bucket: variables[1]?.value ?? "",
    region: variables[2]?.value ?? "",
    accessKeyId: variables[3]?.value ?? "",
    secretAccessKey: variables[4]?.value ?? "",
  };
}

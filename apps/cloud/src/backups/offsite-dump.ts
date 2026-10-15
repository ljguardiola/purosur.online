import { offsiteDumpManifestSchema } from "@purosur/contracts";
import { AwsClient } from "aws4fetch";
import type { DumpedFile } from "./offsite-dump-pipeline.js";

// The largest object one PUT can carry across the S3-compatible providers: Backblaze B2 stops at
// 5 GB (decimal), below Amazon S3's 5 GiB. A bigger dump needs a multipart upload.
export const OFFSITE_DUMP_MAX_OBJECT_BYTES = 5_000_000_000;

const LOG_PREFIX = "offsite-dump";

const VARIABLES = [
  "OFFSITE_DUMP_DATABASE_URL",
  "OFFSITE_DUMP_AGE_RECIPIENT",
  "OFFSITE_DUMP_BUCKET_ENDPOINT",
  "OFFSITE_DUMP_BUCKET_NAME",
  "OFFSITE_DUMP_BUCKET_REGION",
  "OFFSITE_DUMP_BUCKET_ACCESS_KEY_ID",
  "OFFSITE_DUMP_BUCKET_SECRET_ACCESS_KEY",
] as const;

type OffsiteDumpEnv = { [Name in (typeof VARIABLES)[number]]?: string | undefined };

export interface OffsiteDumpConfig {
  databaseUrl: string;
  ageRecipient: string;
  bucket: {
    endpoint: string;
    name: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
}

export interface OffsiteDumpDeps {
  now: () => Date;
  fetch: (request: Request) => Promise<Response>;
  workspace: () => Promise<{ dumpPath: string; cleanup: () => Promise<void> }>;
  dumpToFile: (request: {
    databaseUrl: string;
    ageRecipient: string;
    outputPath: string;
  }) => Promise<DumpedFile>;
  readDump: (path: string) => ReadableStream<Uint8Array>;
  log: (line: string) => void;
}

export function resolveOffsiteDumpConfig(env: OffsiteDumpEnv): OffsiteDumpConfig {
  const missing = VARIABLES.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set`);
  }
  const value = (name: (typeof VARIABLES)[number]) => env[name] ?? "";
  return {
    databaseUrl: value("OFFSITE_DUMP_DATABASE_URL"),
    ageRecipient: value("OFFSITE_DUMP_AGE_RECIPIENT"),
    bucket: {
      endpoint: value("OFFSITE_DUMP_BUCKET_ENDPOINT"),
      name: value("OFFSITE_DUMP_BUCKET_NAME"),
      region: value("OFFSITE_DUMP_BUCKET_REGION"),
      accessKeyId: value("OFFSITE_DUMP_BUCKET_ACCESS_KEY_ID"),
      secretAccessKey: value("OFFSITE_DUMP_BUCKET_SECRET_ACCESS_KEY"),
    },
  };
}

function amzDate(date: Date): string {
  return date.toISOString().replace(/[-:]|\.\d{3}/g, "");
}

async function put(
  config: OffsiteDumpConfig,
  deps: OffsiteDumpDeps,
  key: string,
  upload: {
    body: ReadableStream<Uint8Array> | string;
    sizeBytes: number;
    sha256: string;
    contentType: string;
  },
): Promise<void> {
  const client = new AwsClient({
    accessKeyId: config.bucket.accessKeyId,
    secretAccessKey: config.bucket.secretAccessKey,
    service: "s3",
    region: config.bucket.region,
  });
  const endpoint = new URL(config.bucket.endpoint);
  const request = await client.sign(
    `${endpoint.protocol}//${config.bucket.name}.${endpoint.host}/${key}`,
    {
      method: "PUT",
      headers: {
        "content-type": upload.contentType,
        "content-length": String(upload.sizeBytes),
        "x-amz-content-sha256": upload.sha256,
        // Amazon S3 refuses a PUT into a bucket with Object Lock retention unless it carries a checksum.
        "x-amz-checksum-sha256": Buffer.from(upload.sha256, "hex").toString("base64"),
      },
      body: upload.body,
      aws: { datetime: amzDate(deps.now()) },
    },
  );
  const response = await deps.fetch(request);
  if (!response.ok) {
    throw new Error(`uploading ${key} answered HTTP ${response.status}`);
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ship(config: OffsiteDumpConfig, deps: OffsiteDumpDeps): Promise<void> {
  const night = deps.now().toISOString().slice(0, 10);
  const workspace = await deps.workspace();
  try {
    const dumped = await deps.dumpToFile({
      databaseUrl: config.databaseUrl,
      ageRecipient: config.ageRecipient,
      outputPath: workspace.dumpPath,
    });
    if (dumped.sizeBytes > OFFSITE_DUMP_MAX_OBJECT_BYTES) {
      throw new Error(
        `the encrypted dump is ${dumped.sizeBytes} bytes, larger than the ${OFFSITE_DUMP_MAX_OBJECT_BYTES} bytes one upload carries`,
      );
    }

    await put(config, deps, `offsite-dumps/${night}.dump.age`, {
      body: deps.readDump(workspace.dumpPath),
      sizeBytes: dumped.sizeBytes,
      sha256: dumped.sha256,
      contentType: "application/octet-stream",
    });

    const manifest = JSON.stringify(
      offsiteDumpManifestSchema.parse({
        night,
        sizeBytes: dumped.sizeBytes,
        sha256: dumped.sha256,
      }),
    );
    await put(config, deps, `offsite-dumps/${night}.manifest.json`, {
      body: manifest,
      sizeBytes: new TextEncoder().encode(manifest).length,
      sha256: await sha256Hex(manifest),
      contentType: "application/json",
    });
    deps.log(`${LOG_PREFIX}: shipped the dump of ${night} (${dumped.sizeBytes} bytes)`);
  } finally {
    await workspace.cleanup();
  }
}

/** Returns the process exit code. */
export async function offsiteDumpCommand(
  env: OffsiteDumpEnv,
  deps: OffsiteDumpDeps,
): Promise<number> {
  let config: OffsiteDumpConfig;
  try {
    config = resolveOffsiteDumpConfig(env);
  } catch (error) {
    deps.log(`${LOG_PREFIX}: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  try {
    await ship(config, deps);
    return 0;
  } catch (error) {
    deps.log(`${LOG_PREFIX}: failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

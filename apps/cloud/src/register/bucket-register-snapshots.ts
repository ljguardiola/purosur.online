import { createHash } from "node:crypto";
import { SNAPSHOT_DOWNLOAD_URL_LIFETIME_MS } from "@purosur/domain";
import type {
  AuthorizedSnapshotUpload,
  SnapshotObjectContent,
  SnapshotObjects,
} from "@purosur/domain/register/use-cases";
import { AwsClient } from "aws4fetch";
import type { RegisterSnapshotsBucketConfig } from "./register-snapshots-bucket-config.js";

const KEY_VERSION_HEADER = "x-amz-meta-key-version";

interface BucketRegisterSnapshotsDeps {
  fetch: (request: Request) => Promise<Response>;
  now: () => Date;
}

export interface SnapshotUploadAuthorization {
  url: string;
  requiredHeaders: Record<string, string>;
  expiresAt: Date;
}

function amzDate(date: Date): string {
  return date.toISOString().replace(/[-:]|\.\d{3}/g, "");
}

export class BucketRegisterSnapshots implements SnapshotObjects {
  private readonly client: AwsClient;
  private readonly origin: string;
  private readonly deps: BucketRegisterSnapshotsDeps;

  constructor(config: RegisterSnapshotsBucketConfig, deps: BucketRegisterSnapshotsDeps) {
    this.deps = deps;
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: config.region,
    });
    const endpoint = new URL(config.endpoint);
    this.origin = `${endpoint.protocol}//${config.bucket}.${endpoint.host}`;
  }

  async uploadAuthorization(
    generation: AuthorizedSnapshotUpload,
  ): Promise<SnapshotUploadAuthorization> {
    const signedAt = Math.floor(generation.issuedAt.getTime() / 1000) * 1000;
    const requiredHeaders = { [KEY_VERSION_HEADER]: String(generation.keyVersion) };
    const signed = await this.client.sign(
      this.presignableUrl(
        generation.registerId,
        generation.generationId,
        generation.lifetimeSeconds,
      ),
      {
        method: "PUT",
        headers: requiredHeaders,
        aws: { signQuery: true, datetime: amzDate(generation.issuedAt) },
      },
    );
    return {
      url: signed.url,
      requiredHeaders,
      expiresAt: new Date(signedAt + generation.lifetimeSeconds * 1000),
    };
  }

  async downloadUrl(registerId: string, generationId: string): Promise<string> {
    const signed = await this.client.sign(
      this.presignableUrl(registerId, generationId, SNAPSHOT_DOWNLOAD_URL_LIFETIME_MS / 1000),
      {
        method: "GET",
        aws: { signQuery: true, datetime: amzDate(this.deps.now()) },
      },
    );
    return signed.url;
  }

  async inspect(
    registerId: string,
    generationId: string,
  ): Promise<SnapshotObjectContent | undefined> {
    const response = await this.deps.fetch(
      await this.signedRequest("GET", registerId, generationId),
    );
    if (response.status === 404) {
      await response.body?.cancel();
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`the register snapshots bucket answered HTTP ${response.status}`);
    }
    const hash = createHash("sha256");
    let size = 0;
    if (response.body) {
      for await (const chunk of response.body) {
        hash.update(chunk);
        size += chunk.byteLength;
      }
    }
    return { size, sha256: hash.digest("hex") };
  }

  async remove(registerId: string, generationId: string): Promise<void> {
    const response = await this.deps.fetch(
      await this.signedRequest("DELETE", registerId, generationId),
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`the register snapshots bucket answered HTTP ${response.status}`);
    }
  }

  private presignableUrl(registerId: string, generationId: string, lifetimeSeconds: number): URL {
    const url = new URL(`${this.origin}/snapshots/${registerId}/${generationId}`);
    url.searchParams.set("X-Amz-Expires", String(lifetimeSeconds));
    return url;
  }

  private signedRequest(method: "GET" | "DELETE", registerId: string, generationId: string) {
    return this.client.sign(`${this.origin}/snapshots/${registerId}/${generationId}`, {
      method,
      aws: { datetime: amzDate(this.deps.now()) },
    });
  }
}

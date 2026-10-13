import { registerReleaseEntrySchema, registerVersionText } from "@purosur/contracts";
import type { RegisterRelease, RegisterReleases } from "@purosur/domain/register/use-cases";
import { AwsClient } from "aws4fetch";
import type { RegisterUpdatesBucketConfig } from "./register-updates-bucket-config.js";

const LATEST_KEY = "register-updates/latest.json";
const DOWNLOAD_URL_LIFETIME_SECONDS = 3600;

interface BucketRegisterReleasesDeps {
  fetch: (request: Request) => Promise<Response>;
  now: () => Date;
}

function amzDate(date: Date): string {
  return date.toISOString().replace(/[-:]|\.\d{3}/g, "");
}

export class BucketRegisterReleases implements RegisterReleases {
  private readonly client: AwsClient;
  private readonly origin: string;
  private readonly deps: BucketRegisterReleasesDeps;

  constructor(config: RegisterUpdatesBucketConfig, deps: BucketRegisterReleasesDeps) {
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

  async latest(): Promise<RegisterRelease | undefined> {
    const request = await this.client.sign(`${this.origin}/${LATEST_KEY}`, {
      method: "GET",
      aws: { datetime: amzDate(this.deps.now()) },
    });
    const response = await this.deps.fetch(request);
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`the register updates bucket answered HTTP ${response.status}`);
    }
    const entry = registerReleaseEntrySchema.parse(await response.json());
    return { version: entry.version, file: entry.file, size: entry.size, sha512: entry.sha512 };
  }

  async downloadUrl(release: RegisterRelease): Promise<string> {
    const url = new URL(
      `${this.origin}/register-updates/${registerVersionText(release.version)}/${encodeURIComponent(release.file)}`,
    );
    url.searchParams.set("X-Amz-Expires", String(DOWNLOAD_URL_LIFETIME_SECONDS));
    const signed = await this.client.sign(url, {
      method: "GET",
      aws: { signQuery: true, datetime: amzDate(this.deps.now()) },
    });
    return signed.url;
  }
}

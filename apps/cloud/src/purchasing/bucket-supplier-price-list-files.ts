import type { SupplierPriceListFiles } from "@purosur/domain/purchasing/use-cases";
import { AwsClient } from "aws4fetch";
import type { SupplierPriceListsBucketConfig } from "./supplier-price-lists-bucket-config.js";

interface BucketSupplierPriceListFilesDeps {
  fetch: (request: Request) => Promise<Response>;
  now: () => Date;
}

function amzDate(date: Date): string {
  return date.toISOString().replace(/[-:]|\.\d{3}/g, "");
}

export class BucketSupplierPriceListFiles implements SupplierPriceListFiles {
  private readonly client: AwsClient;
  private readonly origin: string;
  private readonly deps: BucketSupplierPriceListFilesDeps;

  constructor(config: SupplierPriceListsBucketConfig, deps: BucketSupplierPriceListFilesDeps) {
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

  async store(listId: string, bytes: Uint8Array): Promise<void> {
    const response = await this.deps.fetch(
      await this.client.sign(this.objectUrl(listId), {
        method: "PUT",
        headers: { "content-type": "application/pdf" },
        body: bytes.slice(),
        aws: { datetime: amzDate(this.deps.now()) },
      }),
    );
    if (!response.ok) {
      throw new Error(`the supplier price lists bucket answered HTTP ${response.status}`);
    }
  }

  async read(listId: string): Promise<Uint8Array | null> {
    const response = await this.deps.fetch(
      await this.client.sign(this.objectUrl(listId), {
        method: "GET",
        aws: { datetime: amzDate(this.deps.now()) },
      }),
    );
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      throw new Error(`the supplier price lists bucket answered HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  private objectUrl(listId: string): string {
    return `${this.origin}/supplier-price-lists/${listId}.pdf`;
  }
}

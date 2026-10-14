import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BucketRegisterSnapshots } from "./bucket-register-snapshots.js";

const CONFIG = {
  endpoint: "https://t3.storageapi.test",
  bucket: "register-snapshots-fictional",
  region: "auto",
  accessKeyId: "FICTIONALKEYID0001",
  secretAccessKey: "fictional-secret-access-key-0001",
};
const NOW = new Date("2026-10-14T15:00:00.000Z");
const REGISTER_ID = "5b0d1c52-6a0e-4f43-9d0e-2f6a4e9a1b11";
const GENERATION_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const OBJECT_URL = `https://register-snapshots-fictional.t3.storageapi.test/snapshots/${REGISTER_ID}/${GENERATION_ID}`;

function bucketAnswering(respond: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = [];
  const snapshots = new BucketRegisterSnapshots(CONFIG, {
    fetch: async (input) => {
      const request = input as Request;
      requests.push(request);
      return respond(request);
    },
    now: () => NOW,
  });
  return { snapshots, requests };
}

const unused = () => new Response("", { status: 500 });

const UPLOAD = {
  registerId: REGISTER_ID,
  generationId: GENERATION_ID,
  size: 4096,
  sha256: "ab".repeat(32),
  keyVersion: 3,
  issuedAt: NOW,
  lifetimeSeconds: 900,
};

describe("BucketRegisterSnapshots.uploadAuthorization", () => {
  async function authorize(overrides: Partial<typeof UPLOAD> = {}) {
    const { snapshots, requests } = bucketAnswering(unused);
    const authorization = await snapshots.uploadAuthorization({ ...UPLOAD, ...overrides });
    return { authorization, requests, url: new URL(authorization.url) };
  }

  it("presigns a URL on the object key the cloud decides, without calling the bucket", async () => {
    const { requests, url } = await authorize();

    expect(`${url.origin}${url.pathname}`).toBe(OBJECT_URL);
    expect(requests).toEqual([]);
  });

  it("expires when the authorized upload does", async () => {
    const { authorization, url } = await authorize();

    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-Date")).toBe("20261014T150000Z");
    expect(authorization.expiresAt).toEqual(new Date("2026-10-14T15:15:00.000Z"));
  });

  it("expires sooner when the authorized upload ends sooner", async () => {
    const { authorization, url } = await authorize({ lifetimeSeconds: 600 });

    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(authorization.expiresAt).toEqual(new Date("2026-10-14T15:10:00.000Z"));
  });

  it("signs from the moment the upload was authorized, not from its own clock", async () => {
    const { authorization, url } = await authorize({
      issuedAt: new Date("2026-10-14T14:59:30.000Z"),
      lifetimeSeconds: 1,
    });

    expect(url.searchParams.get("X-Amz-Date")).toBe("20261014T145930Z");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("1");
    expect(authorization.expiresAt).toEqual(new Date("2026-10-14T14:59:31.000Z"));
  });

  it("answers the expiry of the whole second the URL is signed at", async () => {
    const { authorization, url } = await authorize({
      issuedAt: new Date("2026-10-14T15:00:00.750Z"),
    });

    expect(url.searchParams.get("X-Amz-Date")).toBe("20261014T150000Z");
    expect(authorization.expiresAt).toEqual(new Date("2026-10-14T15:15:00.000Z"));
  });

  it("signs the key version as object metadata the register has to send", async () => {
    const { authorization, url } = await authorize();

    expect(authorization.requiredHeaders).toEqual({ "x-amz-meta-key-version": "3" });
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("x-amz-meta-key-version");
  });

  it("signs with the configured credentials", async () => {
    const { url } = await authorize();

    expect(url.searchParams.get("X-Amz-Credential")).toMatch(
      /^FICTIONALKEYID0001\/20261014\/auto\/s3\/aws4_request$/,
    );
  });

  it("signs a URL that differs when the key version differs", async () => {
    const { snapshots } = bucketAnswering(unused);
    const of = async (keyVersion: number) =>
      new URL(
        (await snapshots.uploadAuthorization({ ...UPLOAD, keyVersion })).url,
      ).searchParams.get("X-Amz-Signature");

    expect(await of(1)).not.toBe(await of(2));
  });
});

describe("BucketRegisterSnapshots.downloadUrl", () => {
  it("presigns a short-lived read of the object", async () => {
    const { snapshots } = bucketAnswering(unused);

    const url = new URL(await snapshots.downloadUrl(REGISTER_ID, GENERATION_ID));

    expect(`${url.origin}${url.pathname}`).toBe(OBJECT_URL);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
  });
});

describe("BucketRegisterSnapshots.inspect", () => {
  it("reads the object with a signed GET", async () => {
    const { snapshots, requests } = bucketAnswering(() => new Response("content"));

    await snapshots.inspect(REGISTER_ID, GENERATION_ID);

    const [request] = requests;
    expect(request?.method).toBe("GET");
    expect(request?.url).toBe(OBJECT_URL);
    expect(request?.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=FICTIONALKEYID0001\/20261014\/auto\/s3\/aws4_request/,
    );
  });

  it("answers the size and the SHA-256 of what it read", async () => {
    const content = Buffer.from("fictional snapshot content");
    const { snapshots } = bucketAnswering(() => new Response(content));

    expect(await snapshots.inspect(REGISTER_ID, GENERATION_ID)).toEqual({
      size: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  });

  it("hashes an object that arrives in several chunks", async () => {
    const chunks = [Buffer.from("first part, "), Buffer.from("second part")];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });
    const { snapshots } = bucketAnswering(() => new Response(body));

    expect(await snapshots.inspect(REGISTER_ID, GENERATION_ID)).toEqual({
      size: 23,
      sha256: createHash("sha256").update(Buffer.concat(chunks)).digest("hex"),
    });
  });

  it("answers an empty object's size and hash", async () => {
    const { snapshots } = bucketAnswering(() => new Response(""));

    expect(await snapshots.inspect(REGISTER_ID, GENERATION_ID)).toEqual({
      size: 0,
      sha256: createHash("sha256").update("").digest("hex"),
    });
  });

  it("is undefined when the object does not exist", async () => {
    const { snapshots } = bucketAnswering(
      () => new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 }),
    );

    expect(await snapshots.inspect(REGISTER_ID, GENERATION_ID)).toBeUndefined();
  });

  it("fails when the bucket answers another error", async () => {
    const { snapshots } = bucketAnswering(() => new Response("", { status: 500 }));

    await expect(snapshots.inspect(REGISTER_ID, GENERATION_ID)).rejects.toThrow("HTTP 500");
  });
});

describe("BucketRegisterSnapshots.remove", () => {
  it("deletes the object with a signed DELETE", async () => {
    const { snapshots, requests } = bucketAnswering(() => new Response(null, { status: 204 }));

    await snapshots.remove(REGISTER_ID, GENERATION_ID);

    const [request] = requests;
    expect(request?.method).toBe("DELETE");
    expect(request?.url).toBe(OBJECT_URL);
    expect(request?.headers.get("authorization")).toContain("AWS4-HMAC-SHA256");
  });

  it("accepts an object that is already gone", async () => {
    const { snapshots } = bucketAnswering(() => new Response("", { status: 404 }));

    await expect(snapshots.remove(REGISTER_ID, GENERATION_ID)).resolves.toBeUndefined();
  });

  it("fails when the bucket answers another error", async () => {
    const { snapshots } = bucketAnswering(() => new Response("", { status: 403 }));

    await expect(snapshots.remove(REGISTER_ID, GENERATION_ID)).rejects.toThrow("HTTP 403");
  });
});

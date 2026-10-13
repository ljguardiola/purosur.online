import { describe, expect, it } from "vitest";
import { BucketRegisterReleases } from "./bucket-register-releases.js";

const CONFIG = {
  endpoint: "https://t3.storageapi.test",
  bucket: "register-updates-fictional",
  region: "auto",
  accessKeyId: "FICTIONALKEYID0001",
  secretAccessKey: "fictional-secret-access-key-0001",
};
const NOW = new Date("2026-10-12T09:30:00.000Z");
const SHA512 = `${"A".repeat(85)}A==`;
const ENTRY = {
  version: "1.4.2",
  file: "Puro Sur Setup 1.4.2.exe",
  size: 98765432,
  sha512: SHA512,
};

function releasesAnswering(respond: (request: Request) => Response) {
  const requests: Request[] = [];
  const releases = new BucketRegisterReleases(CONFIG, {
    fetch: async (input) => {
      const request = input as Request;
      requests.push(request);
      return respond(request);
    },
    now: () => NOW,
  });
  return { releases, requests };
}

describe("BucketRegisterReleases.latest", () => {
  it("reads register-updates/latest.json with a signed GET on the bucket's own host", async () => {
    const { releases, requests } = releasesAnswering(() => Response.json(ENTRY));

    await releases.latest();

    const [request] = requests;
    expect(request?.method).toBe("GET");
    expect(request?.url).toBe(
      "https://register-updates-fictional.t3.storageapi.test/register-updates/latest.json",
    );
    expect(request?.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=FICTIONALKEYID0001\/20261012\/auto\/s3\/aws4_request/,
    );
  });

  it("is the published release", async () => {
    const { releases } = releasesAnswering(() => Response.json(ENTRY));

    expect(await releases.latest()).toEqual({
      version: { major: 1, minor: 4, patch: 2 },
      file: "Puro Sur Setup 1.4.2.exe",
      size: 98765432,
      sha512: SHA512,
    });
  });

  it("is undefined when nothing is published (NoSuchKey)", async () => {
    const { releases } = releasesAnswering(
      () => new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 }),
    );

    expect(await releases.latest()).toBeUndefined();
  });

  it("fails when the bucket answers another error", async () => {
    const { releases } = releasesAnswering(() => new Response("", { status: 500 }));

    await expect(releases.latest()).rejects.toThrow();
  });

  it("fails when the bucket denies access", async () => {
    const { releases } = releasesAnswering(
      () => new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 }),
    );

    await expect(releases.latest()).rejects.toThrow();
  });

  it.each([
    ["not JSON", "not json"],
    [
      "an entry that does not match the contract",
      JSON.stringify({ ...ENTRY, file: "../evil.exe" }),
    ],
  ])("fails when latest.json is %s", async (_case, body) => {
    const { releases } = releasesAnswering(() => new Response(body, { status: 200 }));

    await expect(releases.latest()).rejects.toThrow();
  });

  it("fails when the bucket cannot be reached", async () => {
    const releases = new BucketRegisterReleases(CONFIG, {
      fetch: async () => {
        throw new TypeError("network down");
      },
      now: () => NOW,
    });

    await expect(releases.latest()).rejects.toThrow("network down");
  });
});

describe("BucketRegisterReleases.downloadUrl", () => {
  const release = {
    version: { major: 1, minor: 4, patch: 2 },
    file: "Puro Sur Setup 1.4.2.exe",
    size: 98765432,
    sha512: SHA512,
  };

  async function presigned(): Promise<URL> {
    const { releases } = releasesAnswering(() => Response.json(ENTRY));
    return new URL(await releases.downloadUrl(release));
  }

  it("addresses exactly the release's installer", async () => {
    const url = await presigned();

    expect(url.origin).toBe("https://register-updates-fictional.t3.storageapi.test");
    expect(decodeURIComponent(url.pathname)).toBe(
      "/register-updates/1.4.2/Puro Sur Setup 1.4.2.exe",
    );
  });

  it("expires one hour after the clock's now, for a GET", async () => {
    const { searchParams } = await presigned();

    expect(searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(searchParams.get("X-Amz-Date")).toBe("20261012T093000Z");
    expect(searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(searchParams.get("X-Amz-Credential")).toBe(
      "FICTIONALKEYID0001/20261012/auto/s3/aws4_request",
    );
    expect(searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("carries no secret", async () => {
    const url = await presigned();

    expect(url.href).not.toContain(CONFIG.secretAccessKey);
  });

  it("is a signature a GET of another key does not share", async () => {
    const { searchParams } = await presigned();
    const { releases } = releasesAnswering(() => Response.json(ENTRY));
    const other = new URL(await releases.downloadUrl({ ...release, file: "Other.exe" }));

    expect(other.searchParams.get("X-Amz-Signature")).not.toBe(searchParams.get("X-Amz-Signature"));
  });
});

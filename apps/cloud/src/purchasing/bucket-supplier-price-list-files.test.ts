import { describe, expect, it } from "vitest";
import { BucketSupplierPriceListFiles } from "./bucket-supplier-price-list-files.js";

const CONFIG = {
  endpoint: "https://t3.storageapi.test",
  bucket: "supplier-price-lists-fictional",
  region: "auto",
  accessKeyId: "FICTIONALKEYID0001",
  secretAccessKey: "fictional-secret-access-key-0001",
};
const NOW = new Date("2026-10-14T15:00:00.000Z");
const LIST_ID = "5b0d1c52-6a0e-4f43-9d0e-2f6a4e9a1b11";
const OBJECT_URL = `https://supplier-price-lists-fictional.t3.storageapi.test/supplier-price-lists/${LIST_ID}.pdf`;
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

function bucketAnswering(respond: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = [];
  const files = new BucketSupplierPriceListFiles(CONFIG, {
    fetch: async (input) => {
      const request = input as Request;
      requests.push(request);
      return respond(request);
    },
    now: () => NOW,
  });
  return { files, requests };
}

describe("BucketSupplierPriceListFiles.store", () => {
  it("puts the bytes under a key made from the list id alone, signed for the bucket", async () => {
    const { files, requests } = bucketAnswering(() => new Response("", { status: 200 }));

    await files.store(LIST_ID, PDF);

    const [request] = requests;
    expect(requests).toHaveLength(1);
    expect(request?.method).toBe("PUT");
    expect(request?.url).toBe(OBJECT_URL);
    expect(request?.headers.get("content-type")).toBe("application/pdf");
    expect(request?.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=FICTIONALKEYID0001\/20261014\/auto\/s3\/aws4_request/,
    );
    expect(new Uint8Array(await (request as Request).arrayBuffer())).toEqual(PDF);
  });

  it("fails when the bucket refuses the object", async () => {
    const { files } = bucketAnswering(() => new Response("", { status: 403 }));

    await expect(files.store(LIST_ID, PDF)).rejects.toThrow(
      "the supplier price lists bucket answered HTTP 403",
    );
  });
});

describe("BucketSupplierPriceListFiles.read", () => {
  it("gets the bytes kept for the list", async () => {
    const { files, requests } = bucketAnswering(() => new Response(PDF, { status: 200 }));

    const bytes = await files.read(LIST_ID);

    expect(bytes).toEqual(PDF);
    expect(requests[0]?.method).toBe("GET");
    expect(requests[0]?.url).toBe(OBJECT_URL);
  });

  it("answers nothing when no file is kept for the list", async () => {
    const { files } = bucketAnswering(() => new Response("", { status: 404 }));

    expect(await files.read(LIST_ID)).toBeNull();
  });

  it("fails when the bucket cannot answer", async () => {
    const { files } = bucketAnswering(() => new Response("", { status: 500 }));

    await expect(files.read(LIST_ID)).rejects.toThrow(
      "the supplier price lists bucket answered HTTP 500",
    );
  });
});

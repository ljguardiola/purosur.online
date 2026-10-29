import type { TagSummary } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createTag } from "./tag-creation-api";

function jsonResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  return new Response(
    body === undefined ? null : JSON.stringify(body),
    headers ? { status, headers } : { status },
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const sinTacc: TagSummary = {
  id: "tag-1",
  name: "Sin TACC",
  active: true,
  version: 1,
  productCount: 42,
};

const JSON_BODY = { headers: { "Content-Type": "application/json" } };
const JSON_POST = { method: "POST", ...JSON_BODY };

describe("createTag", () => {
  test("posts the name and answers the created tag on 201", async () => {
    const vegano = { ...sinTacc, id: "tag-9", name: "Vegano", productCount: 0 };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, vegano));

    expect(await createTag({ name: "Vegano" })).toEqual({ kind: "ok", tag: vegano });
    expect(fetch).toHaveBeenCalledWith("/api/tags", {
      ...JSON_POST,
      body: JSON.stringify({ name: "Vegano" }),
    });
  });

  test("returns failed when the created tag does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { id: "tag-9" }));

    expect(await createTag({ name: "Vegano" })).toEqual({ kind: "failed" });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "name" }] }),
    );

    expect(await createTag({ name: "" })).toEqual({ kind: "validation_failed", field: "name" });
  });

  test("returns failed on a 400 that is not a validation failure", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "other" }));

    expect(await createTag({ name: "Vegano" })).toEqual({ kind: "failed" });
  });

  test("returns name_taken on a 409", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "tag_name_taken" }));

    expect(await createTag({ name: "vegano" })).toEqual({ kind: "name_taken" });
  });

  test.each([
    [401, { kind: "unauthenticated" }],
    [403, { kind: "forbidden" }],
    [500, { kind: "failed" }],
  ])("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await createTag({ name: "Vegano" })).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "120" }));

    expect(await createTag({ name: "Vegano" })).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 120,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await createTag({ name: "Vegano" })).toEqual({ kind: "failed" });
  });
});

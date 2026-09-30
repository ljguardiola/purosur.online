import type { TagSummary } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createTag, deactivateTag, editTag, fetchTags, reactivateTag } from "./tags-api";

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
const sinColorantes: TagSummary = {
  id: "tag-2",
  name: "Sin colorantes",
  active: false,
  version: 3,
  productCount: 3,
};

const JSON_BODY = { headers: { "Content-Type": "application/json" } };
const JSON_POST = { method: "POST", ...JSON_BODY };

describe("fetchTags", () => {
  test("lists every tag on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [sinTacc, sinColorantes]));

    expect(await fetchTags()).toEqual({ kind: "ok", value: [sinTacc, sinColorantes] });
    expect(fetch).toHaveBeenCalledWith("/tags");
  });

  test("returns failed when a listed tag does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [{ ...sinTacc, productCount: "42" }]));

    expect(await fetchTags()).toEqual({ kind: "failed" });
  });

  test.each([
    [401, { kind: "unauthenticated" }],
    [403, { kind: "forbidden" }],
    [500, { kind: "failed" }],
  ])("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchTags()).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await fetchTags()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchTags()).toEqual({ kind: "failed" });
  });
});

describe("createTag", () => {
  test("posts the name and answers the created tag on 201", async () => {
    const vegano = { ...sinTacc, id: "tag-9", name: "Vegano", productCount: 0 };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, vegano));

    expect(await createTag({ name: "Vegano" })).toEqual({ kind: "ok", tag: vegano });
    expect(fetch).toHaveBeenCalledWith("/tags", {
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

describe("editTag", () => {
  test("puts the name and version and returns ok on 200 whatever the body says", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { unexpected: true }));

    expect(await editTag("tag-1", { name: "Sin TACC 2", version: 1 })).toEqual({ kind: "ok" });
    expect(fetch).toHaveBeenCalledWith("/tags/tag-1", {
      method: "PUT",
      ...JSON_BODY,
      body: JSON.stringify({ name: "Sin TACC 2", version: 1 }),
    });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "version" }] }),
    );

    expect(await editTag("tag-1", { name: "Sin TACC", version: 1 })).toEqual({
      kind: "validation_failed",
      field: "version",
    });
  });

  test.each([
    [404, {}, { kind: "not_found" }],
    [409, { code: "stale_version" }, { kind: "stale_version" }],
    [409, { code: "tag_name_taken" }, { kind: "name_taken" }],
    [401, {}, { kind: "unauthenticated" }],
    [403, {}, { kind: "forbidden" }],
    [500, {}, { kind: "failed" }],
  ])("answers a %i carrying %j as %j", async (status, body, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status, body));

    expect(await editTag("tag-1", { name: "Vegano", version: 1 })).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await editTag("tag-1", { name: "Sin TACC", version: 1 })).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 45,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await editTag("tag-1", { name: "Sin TACC", version: 1 })).toEqual({
      kind: "failed",
    });
  });
});

describe.each([
  ["deactivateTag", deactivateTag, "PUT", "tag_already_inactive"],
  ["reactivateTag", reactivateTag, "DELETE", "tag_already_active"],
] as const)("%s", (_name, change, method, alreadyCode) => {
  test(`sends ${method} to the tag's deactivation and returns ok on 200`, async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

    expect(await change("tag-1")).toEqual({ kind: "ok" });
    expect(fetch).toHaveBeenCalledWith("/tags/tag-1/deactivation", { method });
  });

  test.each([
    [404, {}, { kind: "not_found" }],
    [409, { code: alreadyCode }, { kind: "already_changed" }],
    [409, { code: "other" }, { kind: "failed" }],
    [401, {}, { kind: "unauthenticated" }],
    [403, {}, { kind: "forbidden" }],
    [500, {}, { kind: "failed" }],
  ])("answers a %i carrying %j as %j", async (status, body, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status, body));

    expect(await change("tag-1")).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await change("tag-1")).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await change("tag-1")).toEqual({ kind: "failed" });
  });
});

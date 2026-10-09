import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type CloudClientDeps,
  getFromCloud,
  postToCloud,
  postToCloudWithBearer,
} from "./cloud-client";

const CLOUD_URL = "https://staging.purosur.online";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function envelope(code: string, details: unknown[] = []) {
  return { code, message: "x", details };
}

function clientAnswering(...answers: (Response | Error)[]) {
  const requests: Request[] = [];
  const waits: number[] = [];
  const deps: CloudClientDeps = {
    cloudUrl: CLOUD_URL,
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      const answer = answers[Math.min(requests.length - 1, answers.length - 1)];
      if (answer instanceof Error) {
        throw answer;
      }
      return (answer as Response).clone();
    },
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
    },
  };
  return { deps, requests, waits };
}

describe("postToCloud", () => {
  it("posts the body as JSON to the path on the channel's cloud", async () => {
    const { deps, requests } = clientAnswering(jsonResponse(200, { ok: true }));

    const response = await postToCloud(deps, "/api/devices", { code: "X" });

    expect(response).toEqual({ kind: "ok", body: { ok: true } });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`${CLOUD_URL}/api/devices`);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]?.json()).toEqual({ code: "X" });
  });

  it("answers a refusal marked as not retryable at once, without retrying", async () => {
    const { deps, requests } = clientAnswering(
      jsonResponse(403, envelope("enrollment_code_rejected")),
    );

    const response = await postToCloud(deps, "/api/devices", {});

    expect(response).toEqual({ kind: "error", error: envelope("enrollment_code_rejected") });
    expect(requests).toHaveLength(1);
  });

  it("retries a server that is unavailable, waiting longer each time, until it answers", async () => {
    const { deps, requests, waits } = clientAnswering(
      jsonResponse(503, envelope("server_unavailable")),
      jsonResponse(503, envelope("server_unavailable")),
      jsonResponse(200, { ok: true }),
    );

    const response = await postToCloud(deps, "/api/devices", {});

    expect(response).toEqual({ kind: "ok", body: { ok: true } });
    expect(requests).toHaveLength(3);
    expect(waits).toEqual([1000, 2000]);
  });

  it("stops after three attempts and answers the last refusal", async () => {
    const { deps, requests } = clientAnswering(jsonResponse(503, envelope("server_unavailable")));

    const response = await postToCloud(deps, "/api/devices", {});

    expect(response).toEqual({ kind: "error", error: envelope("server_unavailable") });
    expect(requests).toHaveLength(3);
  });

  it("retries a rate limit after the wait it names", async () => {
    const { deps, waits } = clientAnswering(
      jsonResponse(429, envelope("rate_limited", [{ retry_after_seconds: 3 }])),
      jsonResponse(200, { ok: true }),
    );

    expect(await postToCloud(deps, "/api/devices", {})).toEqual({
      kind: "ok",
      body: { ok: true },
    });
    expect(waits).toEqual([3000]);
  });

  it("answers a rate limit whose wait is longer than ten seconds without waiting it out", async () => {
    const limited = envelope("rate_limited", [{ retry_after_seconds: 600 }]);
    const { deps, requests, waits } = clientAnswering(jsonResponse(429, limited));

    expect(await postToCloud(deps, "/api/devices", {})).toEqual({
      kind: "error",
      error: limited,
    });
    expect(requests).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("waits out a rate limit of exactly ten seconds", async () => {
    const { deps, waits } = clientAnswering(
      jsonResponse(429, envelope("rate_limited", [{ retry_after_seconds: 10 }])),
      jsonResponse(200, {}),
    );

    await postToCloud(deps, "/api/devices", {});

    expect(waits).toEqual([10_000]);
  });

  it("doesn't resend a request the cloud may have received when it can't be reached", async () => {
    const { deps, requests, waits } = clientAnswering(new TypeError("fetch failed"));

    expect(await postToCloud(deps, "/api/devices", {})).toEqual({ kind: "unreachable" });
    expect(requests).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("reads a server error from outside the cloud as unavailable, without resending", async () => {
    const { deps, requests } = clientAnswering(
      new Response("<html>Bad gateway</html>", { status: 502 }),
    );

    const response = await postToCloud(deps, "/api/devices", {});

    expect(response).toMatchObject({ kind: "error", error: { code: "server_unavailable" } });
    expect(requests).toHaveLength(1);
  });

  it("reads any other answer outside the contract as an internal error, not retried", async () => {
    const { deps, requests } = clientAnswering(
      jsonResponse(403, { code: "direct_access_rejected", message: "x" }),
    );

    const response = await postToCloud(deps, "/api/devices", {});

    expect(response).toMatchObject({ kind: "error", error: { code: "internal_error" } });
    expect(requests).toHaveLength(1);
  });

  it("reads a success whose body isn't JSON as an empty body", async () => {
    const { deps } = clientAnswering(new Response("not json", { status: 200 }));

    expect(await postToCloud(deps, "/api/devices", {})).toEqual({
      kind: "ok",
      body: undefined,
    });
  });
});

describe("getFromCloud", () => {
  it("gets the path on the channel's cloud with the given headers and no body", async () => {
    const { deps, requests } = clientAnswering(jsonResponse(200, { ok: true }));

    const response = await getFromCloud(deps, "/api/changes?since=4", {
      authorization: "Bearer token",
    });

    expect(response).toEqual({ kind: "ok", body: { ok: true } });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`${CLOUD_URL}/api/changes?since=4`);
    expect(requests[0]?.method).toBe("GET");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer token");
    expect(requests[0]?.body).toBeNull();
  });

  it("retries a retryable refusal the same way a post does", async () => {
    const { deps, requests, waits } = clientAnswering(
      jsonResponse(429, envelope("rate_limited", [{ retry_after_seconds: 3 }])),
      jsonResponse(200, { ok: true }),
    );

    const response = await getFromCloud(deps, "/api/changes?since=0", {});

    expect(response).toEqual({ kind: "ok", body: { ok: true } });
    expect(requests).toHaveLength(2);
    expect(waits).toEqual([3000]);
  });

  it("answers a refusal marked as not retryable at once", async () => {
    const { deps, requests } = clientAnswering(
      jsonResponse(401, envelope("device_token_rejected")),
    );

    const response = await getFromCloud(deps, "/api/changes?since=0", {});

    expect(response).toEqual({ kind: "error", error: envelope("device_token_rejected") });
    expect(requests).toHaveLength(1);
  });

  it("answers an unreachable cloud as unreachable", async () => {
    const { deps } = clientAnswering(new TypeError("fetch failed"));

    expect(await getFromCloud(deps, "/api/changes?since=0", {})).toEqual({ kind: "unreachable" });
  });
});

describe("postToCloudWithBearer", () => {
  it("posts to the path with the token as a bearer credential and no body", async () => {
    const { deps, requests } = clientAnswering(jsonResponse(200, { ok: true }));

    const response = await postToCloudWithBearer(
      deps,
      "/api/devices/current/tokens",
      "prefix.secret",
    );

    expect(response).toEqual({ kind: "ok", body: { ok: true } });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`${CLOUD_URL}/api/devices/current/tokens`);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer prefix.secret");
    expect(requests[0]?.headers.get("content-type")).toBeNull();
    expect(await requests[0]?.text()).toBe("");
  });

  it("answers a refusal without retrying it when the cloud marks it not retryable", async () => {
    const { deps, requests } = clientAnswering(
      jsonResponse(401, envelope("device_token_rejected")),
    );

    const response = await postToCloudWithBearer(
      deps,
      "/api/devices/current/tokens",
      "prefix.secret",
    );

    expect(response).toEqual({ kind: "error", error: envelope("device_token_rejected") });
    expect(requests).toHaveLength(1);
  });

  it("presents the token again on every retry of an unavailable server", async () => {
    const { deps, requests, waits } = clientAnswering(
      jsonResponse(503, envelope("server_unavailable")),
      jsonResponse(200, { ok: true }),
    );

    await postToCloudWithBearer(deps, "/api/devices/current/tokens", "prefix.secret");

    expect(waits).toEqual([1000]);
    expect(requests.map((request) => request.headers.get("authorization"))).toEqual([
      "Bearer prefix.secret",
      "Bearer prefix.secret",
    ]);
  });

  it("answers unreachable when the cloud can't be reached", async () => {
    const { deps } = clientAnswering(new Error("offline"));

    expect(
      await postToCloudWithBearer(deps, "/api/devices/current/tokens", "prefix.secret"),
    ).toEqual({
      kind: "unreachable",
    });
  });
});

describe("postToCloudWithBearer with a body", () => {
  it("posts the body as JSON with the token as a bearer credential", async () => {
    const { deps, requests } = clientAnswering(jsonResponse(200, { ok: true }));

    const response = await postToCloudWithBearer(
      deps,
      "/api/pin-code-redemptions",
      "prefix.secret",
      {
        reset_code: "K7QM2XPA9DTR4HWN",
      },
    );

    expect(response).toEqual({ kind: "ok", body: { ok: true } });
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer prefix.secret");
    expect(requests[0]?.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]?.json()).toEqual({ reset_code: "K7QM2XPA9DTR4HWN" });
  });

  it("sends the same body and token again on every retry", async () => {
    const { deps, requests, waits } = clientAnswering(
      jsonResponse(503, envelope("server_unavailable")),
      jsonResponse(200, { ok: true }),
    );

    await postToCloudWithBearer(deps, "/api/pin-code-redemptions", "prefix.secret", { a: 1 });

    expect(waits).toEqual([1000]);
    expect(await Promise.all(requests.map((request) => request.json()))).toEqual([
      { a: 1 },
      { a: 1 },
    ]);
    expect(requests.map((request) => request.headers.get("authorization"))).toEqual([
      "Bearer prefix.secret",
      "Bearer prefix.secret",
    ]);
  });
});

describe("a call that asks for a time limit and a single attempt", () => {
  const SINGLE_ATTEMPT = { timeoutMs: 5000, singleAttempt: true };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("waits no longer than the limit it asks for", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const { deps } = clientAnswering(jsonResponse(200, { ok: true }));

    await postToCloudWithBearer(deps, "/api/fiscal/authorize", "prefix.secret", {}, SINGLE_ATTEMPT);
    await getFromCloud(deps, "/api/health", {}, SINGLE_ATTEMPT);

    expect(timeout.mock.calls).toEqual([[5000], [5000]]);
  });

  it.each([
    ["a rate limit", jsonResponse(429, envelope("rate_limited", [{ retry_after_seconds: 1 }]))],
    ["an unavailable server", jsonResponse(503, envelope("server_unavailable"))],
  ])("sends a post once and answers %s without waiting it out", async (_case, refusal) => {
    const { deps, requests, waits } = clientAnswering(refusal, jsonResponse(200, { ok: true }));

    const response = await postToCloudWithBearer(
      deps,
      "/api/fiscal/authorize",
      "prefix.secret",
      { a: 1 },
      SINGLE_ATTEMPT,
    );

    expect(response.kind).toBe("error");
    expect(requests).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("sends a get once and answers an unavailable server without waiting it out", async () => {
    const { deps, requests, waits } = clientAnswering(
      jsonResponse(503, envelope("server_unavailable")),
      jsonResponse(200, { ok: true }),
    );

    const response = await getFromCloud(deps, "/api/health", {}, SINGLE_ATTEMPT);

    expect(response.kind).toBe("error");
    expect(requests).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("answers unreachable when the cloud can't be reached", async () => {
    const { deps } = clientAnswering(new Error("socket hang up"));

    expect(
      await postToCloudWithBearer(deps, "/api/fiscal/authorize", "t", {}, SINGLE_ATTEMPT),
    ).toEqual({ kind: "unreachable" });
  });
});

import { describe, expect, it } from "vitest";
import { type CloudClientDeps, getFromCloud, postToCloud } from "./cloud-client";

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

    const response = await postToCloud(deps, "/api/devices/enroll", { code: "X" });

    expect(response).toEqual({ kind: "ok", body: { ok: true } });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`${CLOUD_URL}/api/devices/enroll`);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]?.json()).toEqual({ code: "X" });
  });

  it("answers a refusal marked as not retryable at once, without retrying", async () => {
    const { deps, requests } = clientAnswering(
      jsonResponse(403, envelope("enrollment_code_rejected")),
    );

    const response = await postToCloud(deps, "/api/devices/enroll", {});

    expect(response).toEqual({ kind: "error", error: envelope("enrollment_code_rejected") });
    expect(requests).toHaveLength(1);
  });

  it("retries a server that is unavailable, waiting longer each time, until it answers", async () => {
    const { deps, requests, waits } = clientAnswering(
      jsonResponse(503, envelope("server_unavailable")),
      jsonResponse(503, envelope("server_unavailable")),
      jsonResponse(200, { ok: true }),
    );

    const response = await postToCloud(deps, "/api/devices/enroll", {});

    expect(response).toEqual({ kind: "ok", body: { ok: true } });
    expect(requests).toHaveLength(3);
    expect(waits).toEqual([1000, 2000]);
  });

  it("stops after three attempts and answers the last refusal", async () => {
    const { deps, requests } = clientAnswering(jsonResponse(503, envelope("server_unavailable")));

    const response = await postToCloud(deps, "/api/devices/enroll", {});

    expect(response).toEqual({ kind: "error", error: envelope("server_unavailable") });
    expect(requests).toHaveLength(3);
  });

  it("retries a rate limit after the wait it names", async () => {
    const { deps, waits } = clientAnswering(
      jsonResponse(429, envelope("rate_limited", [{ retry_after_seconds: 3 }])),
      jsonResponse(200, { ok: true }),
    );

    expect(await postToCloud(deps, "/api/devices/enroll", {})).toEqual({
      kind: "ok",
      body: { ok: true },
    });
    expect(waits).toEqual([3000]);
  });

  it("answers a rate limit whose wait is longer than ten seconds without waiting it out", async () => {
    const limited = envelope("rate_limited", [{ retry_after_seconds: 600 }]);
    const { deps, requests, waits } = clientAnswering(jsonResponse(429, limited));

    expect(await postToCloud(deps, "/api/devices/enroll", {})).toEqual({
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

    await postToCloud(deps, "/api/devices/enroll", {});

    expect(waits).toEqual([10_000]);
  });

  it("doesn't resend a request the cloud may have received when it can't be reached", async () => {
    const { deps, requests, waits } = clientAnswering(new TypeError("fetch failed"));

    expect(await postToCloud(deps, "/api/devices/enroll", {})).toEqual({ kind: "unreachable" });
    expect(requests).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("reads a server error from outside the cloud as unavailable, without resending", async () => {
    const { deps, requests } = clientAnswering(
      new Response("<html>Bad gateway</html>", { status: 502 }),
    );

    const response = await postToCloud(deps, "/api/devices/enroll", {});

    expect(response).toMatchObject({ kind: "error", error: { code: "server_unavailable" } });
    expect(requests).toHaveLength(1);
  });

  it("reads any other answer outside the contract as an internal error, not retried", async () => {
    const { deps, requests } = clientAnswering(
      jsonResponse(403, { code: "direct_access_rejected", message: "x" }),
    );

    const response = await postToCloud(deps, "/api/devices/enroll", {});

    expect(response).toMatchObject({ kind: "error", error: { code: "internal_error" } });
    expect(requests).toHaveLength(1);
  });

  it("reads a success whose body isn't JSON as an empty body", async () => {
    const { deps } = clientAnswering(new Response("not json", { status: 200 }));

    expect(await postToCloud(deps, "/api/devices/enroll", {})).toEqual({
      kind: "ok",
      body: undefined,
    });
  });
});

describe("getFromCloud", () => {
  it("gets the path on the channel's cloud with the given headers and no body", async () => {
    const { deps, requests } = clientAnswering(jsonResponse(200, { ok: true }));

    const response = await getFromCloud(deps, "/changes?since=4", {
      authorization: "Bearer token",
    });

    expect(response).toEqual({ kind: "ok", body: { ok: true } });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`${CLOUD_URL}/changes?since=4`);
    expect(requests[0]?.method).toBe("GET");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer token");
    expect(requests[0]?.body).toBeNull();
  });

  it("retries a retryable refusal the same way a post does", async () => {
    const { deps, requests, waits } = clientAnswering(
      jsonResponse(429, envelope("rate_limited", [{ retry_after_seconds: 3 }])),
      jsonResponse(200, { ok: true }),
    );

    const response = await getFromCloud(deps, "/changes?since=0", {});

    expect(response).toEqual({ kind: "ok", body: { ok: true } });
    expect(requests).toHaveLength(2);
    expect(waits).toEqual([3000]);
  });

  it("answers a refusal marked as not retryable at once", async () => {
    const { deps, requests } = clientAnswering(
      jsonResponse(401, envelope("device_token_rejected")),
    );

    const response = await getFromCloud(deps, "/changes?since=0", {});

    expect(response).toEqual({ kind: "error", error: envelope("device_token_rejected") });
    expect(requests).toHaveLength(1);
  });

  it("answers an unreachable cloud as unreachable", async () => {
    const { deps } = clientAnswering(new TypeError("fetch failed"));

    expect(await getFromCloud(deps, "/changes?since=0", {})).toEqual({ kind: "unreachable" });
  });
});

import { describe, expect, it } from "vitest";
import { createMainRequests } from "./main-requests";

const CREDENTIALS = { device_id: "a4b1", device_token: "prefix.secret", pepper: "cGVwcGVy" };

function requestsWithSequentialIds() {
  const posted: unknown[] = [];
  let next = 0;
  const requests = createMainRequests({
    post: (message) => posted.push(message),
    newRequestId: () => `request-${++next}`,
  });
  return { requests, posted };
}

describe("createMainRequests", () => {
  it("asks main to store the credentials and resolves with its answer", async () => {
    const { requests, posted } = requestsWithSequentialIds();

    const stored = requests.storeCredentials(CREDENTIALS);
    requests.receive({ type: "device-credentials-stored", request_id: "request-1", stored: true });

    expect(await stored).toBe(true);
    expect(posted).toEqual([
      { type: "store-device-credentials", request_id: "request-1", credentials: CREDENTIALS },
    ]);
  });

  it("asks main whether credentials are present and resolves with its answer", async () => {
    const { requests, posted } = requestsWithSequentialIds();

    const present = requests.credentialsPresent();
    requests.receive({
      type: "device-credentials-presence",
      request_id: "request-1",
      present: false,
    });

    expect(await present).toBe(false);
    expect(posted).toEqual([{ type: "device-credentials-request", request_id: "request-1" }]);
  });

  it("asks main for the stored credentials and resolves with them", async () => {
    const { requests, posted } = requestsWithSequentialIds();

    const credentials = requests.readCredentials();
    requests.receive({
      type: "device-credentials-read",
      request_id: "request-1",
      credentials: CREDENTIALS,
    });

    expect(await credentials).toEqual(CREDENTIALS);
    expect(posted).toEqual([{ type: "device-credentials-read-request", request_id: "request-1" }]);
  });

  it("resolves with no credentials when main holds none", async () => {
    const { requests } = requestsWithSequentialIds();

    const credentials = requests.readCredentials();
    requests.receive({ type: "device-credentials-read", request_id: "request-1" });

    expect(await credentials).toBeUndefined();
  });

  it("asks main to replace the credentials holding a token and resolves with how it went", async () => {
    const { requests, posted } = requestsWithSequentialIds();

    const outcome = requests.replaceCredentials("old.token", CREDENTIALS);
    requests.receive({
      type: "device-credentials-replaced",
      request_id: "request-1",
      outcome: "superseded",
    });

    expect(await outcome).toBe("superseded");
    expect(posted).toEqual([
      {
        type: "replace-device-credentials",
        request_id: "request-1",
        expected_device_token: "old.token",
        credentials: CREDENTIALS,
      },
    ]);
  });

  it("asks main whether credentials can be stored and resolves with its answer", async () => {
    const { requests, posted } = requestsWithSequentialIds();

    const storable = requests.canStoreCredentials();
    requests.receive({
      type: "device-credentials-storable",
      request_id: "request-1",
      storable: true,
    });

    expect(await storable).toBe(true);
    expect(posted).toEqual([
      { type: "device-credentials-storable-request", request_id: "request-1" },
    ]);
  });

  it("matches each answer to its own request, whatever order they arrive in", async () => {
    const { requests } = requestsWithSequentialIds();

    const first = requests.credentialsPresent();
    const second = requests.credentialsPresent();
    requests.receive({
      type: "device-credentials-presence",
      request_id: "request-2",
      present: true,
    });
    requests.receive({
      type: "device-credentials-presence",
      request_id: "request-1",
      present: false,
    });

    expect(await first).toBe(false);
    expect(await second).toBe(true);
  });

  it("settles no request with a health check", async () => {
    const { requests } = requestsWithSequentialIds();
    const present = requests.credentialsPresent();

    requests.receive({ type: "health-check" });
    requests.receive({
      type: "device-credentials-presence",
      request_id: "request-1",
      present: true,
    });

    expect(await present).toBe(true);
  });

  it("settles nothing with an answer to no pending request", async () => {
    const { requests } = requestsWithSequentialIds();
    const stored = requests.storeCredentials(CREDENTIALS);

    requests.receive({ type: "device-credentials-stored", request_id: "unknown", stored: true });
    requests.receive({ type: "device-credentials-stored", request_id: "request-1", stored: false });

    expect(await stored).toBe(false);
  });

  it("ignores an answer of the other kind for a pending request", async () => {
    const { requests } = requestsWithSequentialIds();
    const stored = requests.storeCredentials(CREDENTIALS);

    requests.receive({
      type: "device-credentials-presence",
      request_id: "request-1",
      present: true,
    });
    requests.receive({ type: "device-credentials-stored", request_id: "request-1", stored: false });

    expect(await stored).toBe(false);
  });
});

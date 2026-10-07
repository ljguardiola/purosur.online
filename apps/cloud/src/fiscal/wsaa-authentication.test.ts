import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type ArcaTestCredentials,
  generateArcaTestCredentials,
} from "./test-support/arca-test-credentials.js";
import {
  answers,
  type FakeWsaaServer,
  readLoginRequest,
  SHA256_OID,
  startFakeWsaaServer,
} from "./test-support/fake-wsaa-server.js";
import { ArcaWsaaAuthentication, wsaaEndpointOf } from "./wsaa-authentication.js";

const NOW = new Date("2026-10-01T15:00:00.000Z");

let server: FakeWsaaServer;
let credentials: ArcaTestCredentials;

beforeAll(async () => {
  server = await startFakeWsaaServer();
  credentials = generateArcaTestCredentials();
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  server.requests.length = 0;
  server.behave(answers("login-cms-issued.xml"));
});

function authenticationOf(endpoint: string, timeoutMs = 5_000) {
  return new ArcaWsaaAuthentication({
    endpoint,
    certificatePem: credentials.certificatePem,
    privateKeyPem: credentials.privateKeyPem,
    now: () => NOW,
    timeoutMs,
  });
}

describe("ArcaWsaaAuthentication", () => {
  it("issues the token and sign ARCA answers with, from the generation to the expiration time", async () => {
    expect(await authenticationOf(server.endpoint).requestToken("wsfe")).toEqual({
      kind: "issued",
      token: {
        token: "FICTIONAL-TOKEN-0001",
        sign: "FICTIONAL-SIGN-0001",
        issuedAt: new Date("2026-10-07T20:44:50.255Z"),
        expiresAt: new Date("2026-10-08T08:44:50.255Z"),
      },
    });
  });

  it("sends the login ticket request for the service, signed as a CMS by the certificate", async () => {
    await authenticationOf(server.endpoint).requestToken("wsfe");

    expect(server.requests).toHaveLength(1);
    const received = readLoginRequest(server.requests[0] ?? "");
    expect(received.signedContent).toContain("<service>wsfe</service>");
    expect(received.signatureValid).toBe(true);
    expect(received.contentDigestMatches).toBe(true);
    expect(received.digestAlgorithmOid).toBe(SHA256_OID);
    expect(new X509Certificate(received.embeddedCertificatePem).fingerprint256).toBe(
      credentials.fingerprint,
    );
  });

  it("asks for the service it is given", async () => {
    await authenticationOf(server.endpoint).requestToken("ws_sr_padron_a13");

    expect(readLoginRequest(server.requests[0] ?? "").signedContent).toContain(
      "<service>ws_sr_padron_a13</service>",
    );
  });

  it("stamps the ticket's times in Argentina time, a few minutes either side of now", async () => {
    await authenticationOf(server.endpoint).requestToken("wsfe");

    const { signedContent } = readLoginRequest(server.requests[0] ?? "");
    expect(signedContent).toContain("<generationTime>2026-10-01T11:55:00-03:00</generationTime>");
    expect(signedContent).toContain("<expirationTime>2026-10-01T12:05:00-03:00</expirationTime>");
  });

  describe("whatever the server's own timezone", () => {
    const originalTimeZone = process.env["TZ"];

    afterEach(() => {
      if (originalTimeZone === undefined) {
        delete process.env["TZ"];
      } else {
        process.env["TZ"] = originalTimeZone;
      }
    });

    it.each(["UTC", "Asia/Tokyo", "America/New_York", "Pacific/Kiritimati"])(
      "formats the ticket's times in Argentina time when the process runs in %s",
      async (timeZone) => {
        process.env["TZ"] = timeZone;

        await authenticationOf(server.endpoint).requestToken("wsfe");

        const { signedContent } = readLoginRequest(server.requests[0] ?? "");
        expect(signedContent).toContain(
          "<generationTime>2026-10-01T11:55:00-03:00</generationTime>",
        );
        expect(signedContent).toContain(
          "<expirationTime>2026-10-01T12:05:00-03:00</expirationTime>",
        );
      },
    );
  });

  it("sends a different unique id on a request made later", async () => {
    let now = NOW;
    const authentication = new ArcaWsaaAuthentication({
      endpoint: server.endpoint,
      certificatePem: credentials.certificatePem,
      privateKeyPem: credentials.privateKeyPem,
      now: () => now,
    });
    await authentication.requestToken("wsfe");
    now = new Date(NOW.getTime() + 1_000);
    await authentication.requestToken("wsfe");

    const uniqueIds = server.requests.map(
      (request) => /<uniqueId>(\d+)<\/uniqueId>/.exec(readLoginRequest(request).signedContent)?.[1],
    );
    expect(uniqueIds[0]).toBeDefined();
    expect(uniqueIds[0]).not.toBe(uniqueIds[1]);
  });

  it("is already authenticated when ARCA answers that the certificate already holds a valid ticket", async () => {
    server.behave(answers("already-authenticated-fault.xml", 500));

    expect(await authenticationOf(server.endpoint).requestToken("wsfe")).toEqual({
      kind: "already_authenticated",
    });
  });

  it("hands over the raw answer ARCA gave, a SOAP fault included", async () => {
    const received: string[] = [];
    const authentication = new ArcaWsaaAuthentication({
      endpoint: server.endpoint,
      certificatePem: credentials.certificatePem,
      privateKeyPem: credentials.privateKeyPem,
      now: () => NOW,
      onRawResponse: (raw) => received.push(raw),
    });

    await authentication.requestToken("wsfe");
    server.behave(answers("already-authenticated-fault.xml", 500));
    await authentication.requestToken("wsfe");

    const responses = new URL("./test-support/wsaa-responses/", import.meta.url);
    expect(received).toEqual([
      readFileSync(new URL("login-cms-issued.xml", responses), "utf8").trim(),
      readFileSync(new URL("already-authenticated-fault.xml", responses), "utf8").trim(),
    ]);
  });

  it("fails on any other fault", async () => {
    server.behave(answers("certificate-expired-fault.xml", 500));

    expect(await authenticationOf(server.endpoint).requestToken("wsfe")).toEqual({
      kind: "failed",
    });
  });

  it("fails on an HTTP error that is not SOAP", async () => {
    server.behave(answers("not-soap.txt", 502));

    expect(await authenticationOf(server.endpoint).requestToken("wsfe")).toEqual({
      kind: "failed",
    });
  });

  it("fails on an answer that carries no ticket", async () => {
    server.behave(answers("not-soap.txt"));

    expect(await authenticationOf(server.endpoint).requestToken("wsfe")).toEqual({
      kind: "failed",
    });
  });

  it("fails when the connection is refused", async () => {
    const closedPort = await new Promise<number>((resolve) => {
      const probe = createServer();
      probe.listen(0, "127.0.0.1", () => {
        const address = probe.address();
        const port = typeof address === "object" && address ? address.port : 0;
        probe.close(() => resolve(port));
      });
    });

    expect(
      await authenticationOf(`http://127.0.0.1:${closedPort}/ws/services/LoginCms`).requestToken(
        "wsfe",
      ),
    ).toEqual({ kind: "failed" });
  });

  it("fails when ARCA never answers within the timeout", async () => {
    server.behave({ kind: "never-answers" });

    expect(await authenticationOf(server.endpoint, 200).requestToken("wsfe")).toEqual({
      kind: "failed",
    });
  });
});

describe("wsaaEndpointOf", () => {
  it("is ARCA's homologation service for homologation and its production service for production", () => {
    expect(wsaaEndpointOf("homologation")).toBe(
      "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    );
    expect(wsaaEndpointOf("production")).toBe("https://wsaa.afip.gov.ar/ws/services/LoginCms");
  });

  it("refuses an environment it does not know", () => {
    expect(() => wsaaEndpointOf("staging")).toThrow(
      'No WSAA endpoint for the ARCA environment "staging"',
    );
  });
});

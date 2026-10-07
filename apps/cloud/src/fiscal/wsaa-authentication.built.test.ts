import { execFile } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { generateArcaTestCredentials } from "./test-support/arca-test-credentials.js";
import { type FakeWsaaServer, startFakeWsaaServer } from "./test-support/fake-wsaa-server.js";

let server: FakeWsaaServer;

beforeAll(async () => {
  server = await startFakeWsaaServer();
});

afterAll(async () => {
  await server.close();
});

describe("the built WSAA authentication", () => {
  it("finds the WSDL the build ships and answers from the endpoint", async () => {
    const credentials = generateArcaTestCredentials();
    const moduleUrl = pathToFileURL(
      join(inject("cloudBuildDir"), "fiscal", "wsaa-authentication.js"),
    ).href;
    const script = `
      const { ArcaWsaaAuthentication } = await import(${JSON.stringify(moduleUrl)});
      const authentication = new ArcaWsaaAuthentication({
        endpoint: ${JSON.stringify(server.endpoint)},
        certificatePem: process.env.TEST_CERTIFICATE_PEM,
        privateKeyPem: process.env.TEST_PRIVATE_KEY_PEM,
        now: () => new Date("2026-10-01T15:00:00.000Z"),
        timeoutMs: 5000,
      });
      console.log(JSON.stringify(await authentication.requestToken("wsfe")));
    `;

    const result = await promisify(execFile)(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        timeout: 30_000,
        env: {
          ...process.env,
          TEST_CERTIFICATE_PEM: credentials.certificatePem,
          TEST_PRIVATE_KEY_PEM: credentials.privateKeyPem,
        },
      },
    );

    expect(JSON.parse(result.stdout)).toEqual({
      kind: "issued",
      token: {
        token: "FICTIONAL-TOKEN-0001",
        sign: "FICTIONAL-SIGN-0001",
        issuedAt: "2026-10-01T15:00:00.000Z",
        expiresAt: "2026-10-02T03:00:00.000Z",
      },
    });
  });
});

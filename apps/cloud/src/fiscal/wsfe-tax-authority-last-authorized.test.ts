import { readFileSync } from "node:fs";
import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  answers,
  type FakeWsfeServer,
  startFakeWsfeServer,
  UNREACHABLE_WSFE_ENDPOINT,
} from "./test-support/fake-wsfe-server.js";
import { WsfeTaxAuthorityLastAuthorized } from "./wsfe-tax-authority-last-authorized.js";

const lookup = {
  token: {
    token: "FICTIONAL-TOKEN-0001",
    sign: "FICTIONAL-SIGN-0001",
    issuedAt: new Date("2026-10-01T06:00:00.000Z"),
    expiresAt: new Date("2026-10-01T18:00:00.000Z"),
  },
  pointOfSale: 7,
};

let server: FakeWsfeServer;

beforeAll(async () => {
  server = await startFakeWsfeServer(answers("fe-comp-ultimo-autorizado.xml"));
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  server.requests.length = 0;
  server.behave(answers("fe-comp-ultimo-autorizado.xml"));
});

function lastAuthorizedAt(endpoint: string, timeoutMs = 5_000) {
  return new WsfeTaxAuthorityLastAuthorized({
    endpoint,
    cuit: FICTIONAL_CERTIFICATE_CUIT,
    timeoutMs,
  });
}

function sentValue(request: string | undefined, element: string): string | undefined {
  return new RegExp(`<(?:\\w+:)?${element}>([^<]*)</(?:\\w+:)?${element}>`).exec(
    request ?? "",
  )?.[1];
}

describe("WsfeTaxAuthorityLastAuthorized", () => {
  it("answers the number ARCA last authorized for the point of sale", async () => {
    expect(await lastAuthorizedAt(server.endpoint).lastAuthorized(lookup)).toEqual({
      kind: "read",
      number: 1,
    });
  });

  it("asks for the Factura C of the point of sale, authenticated with the token and the certificate's CUIT", async () => {
    await lastAuthorizedAt(server.endpoint).lastAuthorized(lookup);

    expect(server.requests).toHaveLength(1);
    const [request] = server.requests;
    expect(request).toContain("FECompUltimoAutorizado");
    expect(sentValue(request, "Token")).toBe("FICTIONAL-TOKEN-0001");
    expect(sentValue(request, "Sign")).toBe("FICTIONAL-SIGN-0001");
    expect(sentValue(request, "Cuit")).toBe(FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", ""));
    expect(sentValue(request, "PtoVta")).toBe("7");
    expect(sentValue(request, "CbteTipo")).toBe("11");
  });

  it.each([
    ["ARCA answers an error", answers("fe-comp-ultimo-autorizado-token-error.xml")],
    ["ARCA answers a SOAP fault", answers("fe-dummy-fault.xml", 500)],
    ["the answer is not SOAP", answers("not-soap.txt")],
    ["ARCA never answers within the timeout", { kind: "never-answers" as const }],
  ])("answers no answer when %s", async (_case, behavior) => {
    server.behave(behavior);

    expect(await lastAuthorizedAt(server.endpoint, 200).lastAuthorized(lookup)).toEqual({
      kind: "no_answer",
    });
  });

  it("answers no answer when ARCA cannot be reached", async () => {
    expect(await lastAuthorizedAt(UNREACHABLE_WSFE_ENDPOINT).lastAuthorized(lookup)).toEqual({
      kind: "no_answer",
    });
  });

  it("hands over the raw answer ARCA gave", async () => {
    const received: string[] = [];
    const lastAuthorized = new WsfeTaxAuthorityLastAuthorized({
      endpoint: server.endpoint,
      cuit: FICTIONAL_CERTIFICATE_CUIT,
      onRawResponse: (raw) => received.push(raw),
    });

    await lastAuthorized.lastAuthorized(lookup);

    const responses = new URL("./test-support/wsfe-responses/", import.meta.url);
    expect(received).toEqual([
      readFileSync(new URL("fe-comp-ultimo-autorizado.xml", responses), "utf8").trim(),
    ]);
  });
});

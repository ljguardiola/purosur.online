import { readFileSync } from "node:fs";
import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  answers,
  type FakeWsfeServer,
  startFakeWsfeServer,
  UNREACHABLE_WSFE_ENDPOINT,
} from "./test-support/fake-wsfe-server.js";
import { WsfeTaxAuthorityOfflineAuthorizationCodes } from "./wsfe-tax-authority-offline-authorization-codes.js";

const FIRST_OCTOBER_HALF = { start: "2026-10-01", end: "2026-10-15" };
const call = {
  token: {
    token: "FICTIONAL-TOKEN-0001",
    sign: "FICTIONAL-SIGN-0001",
    issuedAt: new Date("2026-10-10T02:00:00.000Z"),
    expiresAt: new Date("2026-10-10T14:00:00.000Z"),
  },
  fortnight: FIRST_OCTOBER_HALF,
};
const GRANTED_CODE = {
  code: "36123456789012",
  fortnight: FIRST_OCTOBER_HALF,
  reportDeadline: "2026-10-20",
};

let server: FakeWsfeServer;

beforeAll(async () => {
  server = await startFakeWsfeServer(answers("fe-caea-solicitar-granted.xml"));
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  server.requests.length = 0;
});

function codesAt(endpoint: string, timeoutMs = 5_000) {
  return new WsfeTaxAuthorityOfflineAuthorizationCodes({
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

const noAnswerCases = [
  ["ARCA answers a SOAP fault", answers("fe-dummy-fault.xml", 500)],
  ["the answer is not SOAP", answers("not-soap.txt")],
  ["the answer carries no code", answers("fe-dummy-all-ok.xml")],
  ["ARCA never answers within the timeout", { kind: "never-answers" as const }],
] as const;

describe("WsfeTaxAuthorityOfflineAuthorizationCodes.request", () => {
  it("answers the granted code with the fortnight it covers and its reporting deadline", async () => {
    server.behave(answers("fe-caea-solicitar-granted.xml"));

    expect(await codesAt(server.endpoint).request(call)).toEqual({
      kind: "granted",
      code: GRANTED_CODE,
    });
  });

  it("requests the fortnight by its month and half, authenticated with the token and the certificate's CUIT", async () => {
    server.behave(answers("fe-caea-solicitar-granted.xml"));

    await codesAt(server.endpoint).request(call);

    expect(server.requests).toHaveLength(1);
    const [request] = server.requests;
    expect(request).toContain("FECAEASolicitar");
    expect(sentValue(request, "Token")).toBe("FICTIONAL-TOKEN-0001");
    expect(sentValue(request, "Sign")).toBe("FICTIONAL-SIGN-0001");
    expect(sentValue(request, "Cuit")).toBe(FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", ""));
    expect(sentValue(request, "Periodo")).toBe("202610");
    expect(sentValue(request, "Orden")).toBe("1");
  });

  it("requests the second half of a month as its second order", async () => {
    server.behave(answers("fe-caea-solicitar-granted.xml"));

    await codesAt(server.endpoint).request({
      ...call,
      fortnight: { start: "2026-12-16", end: "2026-12-31" },
    });

    expect(sentValue(server.requests[0], "Periodo")).toBe("202612");
    expect(sentValue(server.requests[0], "Orden")).toBe("2");
  });

  it("answers already granted when ARCA refuses because the fortnight's code was granted", async () => {
    server.behave(answers("fe-caea-solicitar-already-granted.xml"));

    expect(await codesAt(server.endpoint).request(call)).toEqual({ kind: "already_granted" });
  });

  it("answers any other refusal with what ARCA said", async () => {
    server.behave(answers("fe-caea-solicitar-out-of-window.xml"));

    expect(await codesAt(server.endpoint).request(call)).toEqual({
      kind: "refused",
      rejections: [
        {
          code: 15006,
          message:
            "Fecha de envío podrá ser desde 5 días corridos anteriores al inicio hasta el último dia de cada quincena. Del 26/11/2026 hasta 15/12/2026",
        },
      ],
    });
  });

  it.each(noAnswerCases)("answers no answer when %s", async (_case, behavior) => {
    server.behave(behavior);

    expect(await codesAt(server.endpoint, 200).request(call)).toEqual({ kind: "no_answer" });
  });

  it("answers no answer when ARCA cannot be reached", async () => {
    expect(await codesAt(UNREACHABLE_WSFE_ENDPOINT).request(call)).toEqual({ kind: "no_answer" });
  });
});

describe("WsfeTaxAuthorityOfflineAuthorizationCodes.lookUp", () => {
  it("answers the code ARCA already granted for the fortnight", async () => {
    server.behave(answers("fe-caea-consultar-granted.xml"));

    expect(await codesAt(server.endpoint).lookUp(call)).toEqual({
      kind: "granted",
      code: GRANTED_CODE,
    });
  });

  it("looks the fortnight up by its month and half, authenticated with the token and the certificate's CUIT", async () => {
    server.behave(answers("fe-caea-consultar-granted.xml"));

    await codesAt(server.endpoint).lookUp(call);

    const [request] = server.requests;
    expect(request).toContain("FECAEAConsultar");
    expect(sentValue(request, "Token")).toBe("FICTIONAL-TOKEN-0001");
    expect(sentValue(request, "Sign")).toBe("FICTIONAL-SIGN-0001");
    expect(sentValue(request, "Cuit")).toBe(FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", ""));
    expect(sentValue(request, "Periodo")).toBe("202610");
    expect(sentValue(request, "Orden")).toBe("1");
  });

  it("answers not granted when ARCA holds no code for the fortnight", async () => {
    server.behave(answers("fe-caea-consultar-not-granted.xml"));

    expect(await codesAt(server.endpoint).lookUp(call)).toEqual({ kind: "not_granted" });
  });

  it("answers any other refusal with what ARCA said", async () => {
    server.behave(answers("fe-caea-consultar-token-error.xml"));

    expect(await codesAt(server.endpoint).lookUp(call)).toEqual({
      kind: "refused",
      rejections: [
        {
          code: 600,
          message:
            "ValidacionDeToken: No valido token. Excepcion: CargarStringBase64Token: Excepción: The input is not a valid Base-64 string as it contains a non-base 64 character, more than two padding characters, or an illegal character among the padding characters.",
        },
      ],
    });
  });

  it.each(noAnswerCases)("answers no answer when %s", async (_case, behavior) => {
    server.behave(behavior);

    expect(await codesAt(server.endpoint, 200).lookUp(call)).toEqual({ kind: "no_answer" });
  });

  it("answers no answer when ARCA cannot be reached", async () => {
    expect(await codesAt(UNREACHABLE_WSFE_ENDPOINT).lookUp(call)).toEqual({ kind: "no_answer" });
  });
});

it("hands over the raw answer ARCA gave to each call", async () => {
  const received: string[] = [];
  const codes = new WsfeTaxAuthorityOfflineAuthorizationCodes({
    endpoint: server.endpoint,
    cuit: FICTIONAL_CERTIFICATE_CUIT,
    onRawResponse: (raw) => received.push(raw),
  });
  server.behave(answers("fe-caea-solicitar-already-granted.xml"));
  await codes.request(call);
  server.behave(answers("fe-caea-consultar-granted.xml"));
  await codes.lookUp(call);

  const responses = new URL("./test-support/wsfe-responses/", import.meta.url);
  expect(received).toEqual([
    readFileSync(new URL("fe-caea-solicitar-already-granted.xml", responses), "utf8").trim(),
    readFileSync(new URL("fe-caea-consultar-granted.xml", responses), "utf8").trim(),
  ]);
});

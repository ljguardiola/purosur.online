import { readFileSync } from "node:fs";
import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  answers,
  type FakeWsfeServer,
  startFakeWsfeServer,
  UNREACHABLE_WSFE_ENDPOINT,
} from "./test-support/fake-wsfe-server.js";
import { WsfeTaxAuthorityNoMovementDeclarations } from "./wsfe-tax-authority-no-movement-declarations.js";

const call = {
  token: {
    token: "FICTIONAL-TOKEN-0001",
    sign: "FICTIONAL-SIGN-0001",
    issuedAt: new Date("2026-10-16T02:00:00.000Z"),
    expiresAt: new Date("2026-10-16T14:00:00.000Z"),
  },
  pointOfSaleNumber: 8,
  code: "36123456789012",
};

let server: FakeWsfeServer;

beforeAll(async () => {
  server = await startFakeWsfeServer();
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  server.requests.length = 0;
});

function declarationsAt(endpoint: string, timeoutMs = 5_000) {
  return new WsfeTaxAuthorityNoMovementDeclarations({
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
  ["the answer says nothing about the declaration", answers("fe-dummy-all-ok.xml")],
  ["ARCA never answers within the timeout", { kind: "never-answers" as const }],
] as const;

describe("WsfeTaxAuthorityNoMovementDeclarations.lookUp", () => {
  it("answers held when ARCA lists the code as declared without movement for the point of sale", async () => {
    server.behave(answers("fe-caea-sin-movimiento-consultar-held.xml"));

    expect(await declarationsAt(server.endpoint).lookUp(call)).toEqual({ kind: "held" });
  });

  it("asks for the point of sale and the code, authenticated with the token and the certificate's CUIT", async () => {
    server.behave(answers("fe-caea-sin-movimiento-consultar-held.xml"));

    await declarationsAt(server.endpoint).lookUp(call);

    const [request] = server.requests;
    expect(request).toContain("FECAEASinMovimientoConsultar");
    expect(sentValue(request, "Token")).toBe("FICTIONAL-TOKEN-0001");
    expect(sentValue(request, "Sign")).toBe("FICTIONAL-SIGN-0001");
    expect(sentValue(request, "Cuit")).toBe(FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", ""));
    expect(sentValue(request, "PtoVta")).toBe("8");
    expect(sentValue(request, "CAEA")).toBe("36123456789012");
  });

  it("answers not held when ARCA lists no declaration for the point of sale and code", async () => {
    server.behave(answers("fe-caea-sin-movimiento-consultar-not-held.xml"));

    expect(await declarationsAt(server.endpoint).lookUp(call)).toEqual({ kind: "not_held" });
  });

  it("answers not held when ARCA lists a declaration of another code only", async () => {
    server.behave(answers("fe-caea-sin-movimiento-consultar-other-code.xml"));

    expect(await declarationsAt(server.endpoint).lookUp(call)).toEqual({ kind: "not_held" });
  });

  it("answers any other refusal with what ARCA said", async () => {
    server.behave(answers("fe-caea-sin-movimiento-consultar-token-error.xml"));

    expect(await declarationsAt(server.endpoint).lookUp(call)).toEqual({
      kind: "refused",
      rejections: [{ code: 600, message: "ValidacionDeToken: No valido token." }],
    });
  });

  it.each(noAnswerCases)("answers no answer when %s", async (_case, behavior) => {
    server.behave(behavior);

    expect(await declarationsAt(server.endpoint, 200).lookUp(call)).toEqual({
      kind: "no_answer",
    });
  });

  it("answers no answer when ARCA cannot be reached", async () => {
    expect(await declarationsAt(UNREACHABLE_WSFE_ENDPOINT).lookUp(call)).toEqual({
      kind: "no_answer",
    });
  });
});

describe("WsfeTaxAuthorityNoMovementDeclarations.declare", () => {
  it("answers accepted when ARCA registers the declaration", async () => {
    server.behave(answers("fe-caea-sin-movimiento-informar-accepted.xml"));

    expect(await declarationsAt(server.endpoint).declare(call)).toEqual({ kind: "accepted" });
  });

  it("declares the point of sale and the code, authenticated with the token and the certificate's CUIT", async () => {
    server.behave(answers("fe-caea-sin-movimiento-informar-accepted.xml"));

    await declarationsAt(server.endpoint).declare(call);

    const [request] = server.requests;
    expect(request).toContain("FECAEASinMovimientoInformar");
    expect(sentValue(request, "Token")).toBe("FICTIONAL-TOKEN-0001");
    expect(sentValue(request, "Sign")).toBe("FICTIONAL-SIGN-0001");
    expect(sentValue(request, "Cuit")).toBe(FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", ""));
    expect(sentValue(request, "PtoVta")).toBe("8");
    expect(sentValue(request, "CAEA")).toBe("36123456789012");
  });

  it("answers refused with what ARCA said when the code was already reported as used", async () => {
    server.behave(answers("fe-caea-sin-movimiento-informar-already-used.xml"));

    expect(await declarationsAt(server.endpoint).declare(call)).toEqual({
      kind: "refused",
      rejections: [
        {
          code: 1202,
          message:
            "El CAEA ya fue informado como utilizado en un comprobante para el punto de venta.",
        },
      ],
    });
  });

  it.each(noAnswerCases)("answers no answer when %s", async (_case, behavior) => {
    server.behave(behavior);

    expect(await declarationsAt(server.endpoint, 200).declare(call)).toEqual({
      kind: "no_answer",
    });
  });

  it("answers no answer when ARCA cannot be reached", async () => {
    expect(await declarationsAt(UNREACHABLE_WSFE_ENDPOINT).declare(call)).toEqual({
      kind: "no_answer",
    });
  });
});

it("hands over the raw answer ARCA gave to each call", async () => {
  const received: string[] = [];
  const declarations = new WsfeTaxAuthorityNoMovementDeclarations({
    endpoint: server.endpoint,
    cuit: FICTIONAL_CERTIFICATE_CUIT,
    onRawResponse: (raw) => received.push(raw),
  });
  server.behave(answers("fe-caea-sin-movimiento-consultar-not-held.xml"));
  await declarations.lookUp(call);
  server.behave(answers("fe-caea-sin-movimiento-informar-accepted.xml"));
  await declarations.declare(call);

  const responses = new URL("./test-support/wsfe-responses/", import.meta.url);
  expect(received).toEqual([
    readFileSync(
      new URL("fe-caea-sin-movimiento-consultar-not-held.xml", responses),
      "utf8",
    ).trim(),
    readFileSync(new URL("fe-caea-sin-movimiento-informar-accepted.xml", responses), "utf8").trim(),
  ]);
});

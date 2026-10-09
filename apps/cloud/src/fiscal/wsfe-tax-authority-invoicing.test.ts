import { readFileSync } from "node:fs";
import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import type { FiscalDocumentSolicitation } from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  answers,
  type FakeWsfeServer,
  startFakeWsfeServer,
  UNREACHABLE_WSFE_ENDPOINT,
} from "./test-support/fake-wsfe-server.js";
import { WsfeTaxAuthorityInvoicing } from "./wsfe-tax-authority-invoicing.js";

const solicitation: FiscalDocumentSolicitation = {
  token: {
    token: "FICTIONAL-TOKEN-0001",
    sign: "FICTIONAL-SIGN-0001",
    issuedAt: new Date("2026-10-01T06:00:00.000Z"),
    expiresAt: new Date("2026-10-01T18:00:00.000Z"),
  },
  pointOfSale: 7,
  number: 42,
  issuedOn: "2026-10-06",
  total: 12_550,
  buyerTaxStatusCode: 5,
};

let server: FakeWsfeServer;

beforeAll(async () => {
  server = await startFakeWsfeServer(answers("fe-cae-solicitar-authorized.xml"));
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  server.requests.length = 0;
  server.behave(answers("fe-cae-solicitar-authorized.xml"));
});

function invoicingAt(endpoint: string, timeoutMs = 5_000) {
  return new WsfeTaxAuthorityInvoicing({ endpoint, cuit: FICTIONAL_CERTIFICATE_CUIT, timeoutMs });
}

function sentValue(request: string | undefined, element: string): string | undefined {
  return new RegExp(`<(?:\\w+:)?${element}>([^<]*)</(?:\\w+:)?${element}>`).exec(
    request ?? "",
  )?.[1];
}

describe("WsfeTaxAuthorityInvoicing", () => {
  describe("what it asks", () => {
    it("asks for one Factura C of the point of sale, authenticated with the token and the certificate's CUIT", async () => {
      await invoicingAt(server.endpoint).solicit(solicitation);

      expect(server.requests).toHaveLength(1);
      const [request] = server.requests;
      expect(request).toContain("FECAESolicitar");
      expect(sentValue(request, "Token")).toBe("FICTIONAL-TOKEN-0001");
      expect(sentValue(request, "Sign")).toBe("FICTIONAL-SIGN-0001");
      expect(sentValue(request, "Cuit")).toBe(FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", ""));
      expect(sentValue(request, "CantReg")).toBe("1");
      expect(sentValue(request, "PtoVta")).toBe("7");
      expect(sentValue(request, "CbteTipo")).toBe("11");
    });

    it("asks for the document's number, date, total and buyer tax status, as a sale of products to a final consumer in pesos", async () => {
      await invoicingAt(server.endpoint).solicit(solicitation);

      const [request] = server.requests;
      expect(sentValue(request, "Concepto")).toBe("1");
      expect(sentValue(request, "DocTipo")).toBe("99");
      expect(sentValue(request, "DocNro")).toBe("0");
      expect(sentValue(request, "CbteDesde")).toBe("42");
      expect(sentValue(request, "CbteHasta")).toBe("42");
      expect(sentValue(request, "CbteFch")).toBe("20261006");
      expect(sentValue(request, "ImpTotal")).toBe("125.50");
      expect(sentValue(request, "ImpTotConc")).toBe("0");
      expect(sentValue(request, "ImpNeto")).toBe("125.50");
      expect(sentValue(request, "ImpOpEx")).toBe("0");
      expect(sentValue(request, "ImpTrib")).toBe("0");
      expect(sentValue(request, "ImpIVA")).toBe("0");
      expect(sentValue(request, "MonId")).toBe("PES");
      expect(sentValue(request, "MonCotiz")).toBe("1");
      expect(sentValue(request, "CondicionIVAReceptorId")).toBe("5");
    });

    it("carries no VAT breakdown, since a Factura C has none", async () => {
      await invoicingAt(server.endpoint).solicit(solicitation);

      expect(server.requests[0]).not.toMatch(/<(\w+:)?Iva>/);
    });

    it("writes the total in pesos from its cents without a rounding error", async () => {
      await invoicingAt(server.endpoint).solicit({ ...solicitation, total: 1_999 });

      expect(sentValue(server.requests[0], "ImpTotal")).toBe("19.99");
    });
  });

  describe("what it answers", () => {
    it("answers authorized with the authorization code and the date it is due, as an ISO date", async () => {
      expect(await invoicingAt(server.endpoint).solicit(solicitation)).toEqual({
        kind: "authorized",
        authorizationCode: "74123456789012",
        authorizationCodeDueOn: "2026-10-18",
      });
    });

    it.each([
      [
        "the content is refused",
        "fe-cae-solicitar-rejected-content.xml",
        [
          {
            code: 10242,
            message:
              "El campo Condicion IVA receptor no es un valor permitido. Consular metodo FEParamGetCondicionIvaReceptor",
          },
        ],
      ],
      [
        "its number is out of order",
        "fe-cae-solicitar-rejected-out-of-order.xml",
        [
          {
            code: 10016,
            message:
              "El numero o fecha del comprobante no se corresponde con el proximo a autorizar. Consultar metodo FECompUltimoAutorizado.",
          },
        ],
      ],
      [
        "ARCA gives observations and an error",
        "fe-cae-solicitar-rejected-with-errors.xml",
        [
          {
            code: 10246,
            message:
              "El campo Condicion Frente al IVA del receptor no es valido para el tipo de comprobante.",
          },
          { code: 10015, message: "Si DocTipo es 99 DocNro debe ser 0." },
          { code: 10000, message: "Error de validacion." },
        ],
      ],
    ])(
      "answers rejected with every code and message ARCA gave when %s",
      async (_case, file, rejections) => {
        server.behave(answers(file));

        expect(await invoicingAt(server.endpoint).solicit(solicitation)).toEqual({
          kind: "rejected",
          rejections,
        });
      },
    );

    it("answers refused without a result, with the codes and messages, when ARCA answers errors and no result", async () => {
      server.behave(answers("fe-cae-solicitar-token-error.xml"));

      expect(await invoicingAt(server.endpoint).solicit(solicitation)).toEqual({
        kind: "refused_without_result",
        rejections: [
          {
            code: 600,
            message:
              "ValidacionDeToken: No validaron las fechas del token GenTime, ExpTime, NowUTC",
          },
        ],
      });
    });

    it.each([
      ["ARCA answers a SOAP fault", answers("fe-dummy-fault.xml", 500)],
      ["the answer is not SOAP", answers("not-soap.txt")],
      ["the answer holds no result", answers("fe-cae-solicitar-empty.xml")],
      ["ARCA refuses without saying why", answers("fe-cae-solicitar-rejected-without-codes.xml")],
      ["ARCA never answers within the timeout", { kind: "never-answers" as const }],
    ])("answers no answer when %s", async (_case, behavior) => {
      server.behave(behavior);

      expect(await invoicingAt(server.endpoint, 200).solicit(solicitation)).toEqual({
        kind: "no_answer",
      });
    });

    it("answers no answer when ARCA cannot be reached", async () => {
      expect(await invoicingAt(UNREACHABLE_WSFE_ENDPOINT).solicit(solicitation)).toEqual({
        kind: "no_answer",
      });
    });
  });

  it("hands over the raw answer ARCA gave", async () => {
    const received: string[] = [];
    const invoicing = new WsfeTaxAuthorityInvoicing({
      endpoint: server.endpoint,
      cuit: FICTIONAL_CERTIFICATE_CUIT,
      onRawResponse: (raw) => received.push(raw),
    });

    await invoicing.solicit(solicitation);

    const responses = new URL("./test-support/wsfe-responses/", import.meta.url);
    expect(received).toEqual([
      readFileSync(new URL("fe-cae-solicitar-authorized.xml", responses), "utf8").trim(),
    ]);
  });
});

import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import type { CreditNoteSolicitation } from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  answers,
  type FakeWsfeServer,
  startFakeWsfeServer,
  UNREACHABLE_WSFE_ENDPOINT,
} from "./test-support/fake-wsfe-server.js";
import { WsfeTaxAuthorityCreditNotes } from "./wsfe-tax-authority-credit-notes.js";

const solicitation: CreditNoteSolicitation = {
  token: {
    token: "FICTIONAL-TOKEN-0001",
    sign: "FICTIONAL-SIGN-0001",
    issuedAt: new Date("2026-10-01T06:00:00.000Z"),
    expiresAt: new Date("2026-10-01T18:00:00.000Z"),
  },
  pointOfSale: 7,
  number: 5,
  issuedOn: "2026-10-08",
  total: 12_550,
  receiverTaxStatusCode: 5,
  associatedVoucher: { voucherType: 11, pointOfSale: 7, number: 42 },
};

let server: FakeWsfeServer;

beforeAll(async () => {
  server = await startFakeWsfeServer(answers("fe-cae-solicitar-credit-note-authorized.xml"));
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  server.requests.length = 0;
  server.behave(answers("fe-cae-solicitar-credit-note-authorized.xml"));
});

function creditNotesAt(endpoint: string, timeoutMs = 5_000) {
  return new WsfeTaxAuthorityCreditNotes({
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

function associatedBlock(request: string | undefined): string | undefined {
  return /<(?:\w+:)?CbtesAsoc>([\s\S]*?)<\/(?:\w+:)?CbtesAsoc>/.exec(request ?? "")?.[1];
}

describe("WsfeTaxAuthorityCreditNotes", () => {
  describe("what it asks", () => {
    it("asks for one credit note C of the point of sale, authenticated with the token and the certificate's CUIT", async () => {
      await creditNotesAt(server.endpoint).solicit(solicitation);

      expect(server.requests).toHaveLength(1);
      const [request] = server.requests;
      expect(request).toContain("FECAESolicitar");
      expect(sentValue(request, "Token")).toBe("FICTIONAL-TOKEN-0001");
      expect(sentValue(request, "Sign")).toBe("FICTIONAL-SIGN-0001");
      expect(sentValue(request, "Cuit")).toBe(FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", ""));
      expect(sentValue(request, "CantReg")).toBe("1");
      expect(sentValue(request, "PtoVta")).toBe("7");
      expect(sentValue(request, "CbteTipo")).toBe("13");
    });

    it("asks for the credit note's number, the day it is issued and the orphan's total, to a final consumer", async () => {
      await creditNotesAt(server.endpoint).solicit(solicitation);

      const [request] = server.requests;
      expect(sentValue(request, "DocTipo")).toBe("99");
      expect(sentValue(request, "DocNro")).toBe("0");
      expect(sentValue(request, "CbteDesde")).toBe("5");
      expect(sentValue(request, "CbteHasta")).toBe("5");
      expect(sentValue(request, "CbteFch")).toBe("20261008");
      expect(sentValue(request, "ImpTotal")).toBe("125.50");
      expect(sentValue(request, "ImpNeto")).toBe("125.50");
      expect(sentValue(request, "CondicionIVAReceptorId")).toBe("5");
    });

    it("associates the credit note to the voucher it cancels by type, point of sale and number, with no date", async () => {
      await creditNotesAt(server.endpoint).solicit(solicitation);

      const block = associatedBlock(server.requests[0]);
      expect(sentValue(block, "Tipo")).toBe("11");
      expect(sentValue(block, "PtoVta")).toBe("7");
      expect(sentValue(block, "Nro")).toBe("42");
      expect(block).not.toMatch(/CbteFch/);
      expect(block).not.toMatch(/Cuit/);
    });

    it("carries no VAT breakdown, since a credit note C has none", async () => {
      await creditNotesAt(server.endpoint).solicit(solicitation);

      expect(server.requests[0]).not.toMatch(/<(\w+:)?Iva>/);
    });
  });

  describe("what it answers", () => {
    it("answers authorized with the authorization code and the date it is due, as an ISO date", async () => {
      expect(await creditNotesAt(server.endpoint).solicit(solicitation)).toEqual({
        kind: "authorized",
        authorizationCode: "74123456789055",
        authorizationCodeDueOn: "2026-10-18",
      });
    });

    it("answers rejected with every code and message ARCA gave", async () => {
      server.behave(answers("fe-cae-solicitar-credit-note-rejected.xml"));

      expect(await creditNotesAt(server.endpoint).solicit(solicitation)).toEqual({
        kind: "rejected",
        rejections: [
          {
            code: 10242,
            message:
              "El campo Condicion IVA receptor no es un valor permitido. Consular metodo FEParamGetCondicionIvaReceptor",
          },
        ],
      });
    });

    it("answers a numbering conflict as a rejection of code 10016, as ARCA gives it", async () => {
      server.behave(answers("fe-cae-solicitar-rejected-out-of-order.xml"));

      expect(await creditNotesAt(server.endpoint).solicit(solicitation)).toMatchObject({
        kind: "rejected",
        rejections: [{ code: 10016 }],
      });
    });

    it.each([
      ["ARCA answers a SOAP fault", answers("fe-dummy-fault.xml", 500)],
      ["the answer is not SOAP", answers("not-soap.txt")],
      ["the answer holds no result", answers("fe-cae-solicitar-empty.xml")],
      ["ARCA never answers within the timeout", { kind: "never-answers" as const }],
    ])("answers no answer when %s", async (_case, behavior) => {
      server.behave(behavior);

      expect(await creditNotesAt(server.endpoint, 200).solicit(solicitation)).toMatchObject({
        kind: "no_answer",
      });
    });

    it("answers no answer when ARCA is unreachable", async () => {
      expect(await creditNotesAt(UNREACHABLE_WSFE_ENDPOINT).solicit(solicitation)).toMatchObject({
        kind: "no_answer",
      });
    });
  });
});

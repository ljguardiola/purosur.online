import { readFileSync } from "node:fs";
import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  answers,
  type FakeWsfeServer,
  startFakeWsfeServer,
  UNREACHABLE_WSFE_ENDPOINT,
} from "./test-support/fake-wsfe-server.js";
import { WsfeBuyerTaxStatusSource } from "./wsfe-buyer-tax-status-source.js";

const token = {
  token: "FICTIONAL-TOKEN-0001",
  sign: "FICTIONAL-SIGN-0001",
  issuedAt: new Date("2026-10-01T06:00:00.000Z"),
  expiresAt: new Date("2026-10-01T18:00:00.000Z"),
};

let server: FakeWsfeServer;

beforeAll(async () => {
  server = await startFakeWsfeServer(answers("fe-param-get-condicion-iva-receptor.xml"));
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  server.requests.length = 0;
  server.behave(answers("fe-param-get-condicion-iva-receptor.xml"));
});

function sourceAt(endpoint: string, timeoutMs = 5_000) {
  return new WsfeBuyerTaxStatusSource({ endpoint, cuit: FICTIONAL_CERTIFICATE_CUIT, timeoutMs });
}

describe("WsfeBuyerTaxStatusSource", () => {
  it("answers every value ARCA lists, each with the invoice classes it applies to", async () => {
    expect(await sourceAt(server.endpoint).fetchBuyerTaxStatusSet(token)).toEqual({
      kind: "fetched",
      options: [
        { code: 1, description: "IVA Responsable Inscripto", invoiceClass: "A/M/C" },
        { code: 5, description: "Consumidor Final", invoiceClass: "B/C" },
        { code: 6, description: "Responsable Monotributo", invoiceClass: "A/M/C" },
      ],
    });
  });

  it("answers a list of one value as a set of one", async () => {
    server.behave(answers("fe-param-get-condicion-iva-receptor-single.xml"));

    expect(await sourceAt(server.endpoint).fetchBuyerTaxStatusSet(token)).toEqual({
      kind: "fetched",
      options: [{ code: 5, description: "Consumidor Final", invoiceClass: "B/C" }],
    });
  });

  it("asks for the values of every invoice class, authenticated with the token and the certificate's CUIT", async () => {
    await sourceAt(server.endpoint).fetchBuyerTaxStatusSet(token);

    expect(server.requests).toHaveLength(1);
    const [request] = server.requests;
    expect(request).toContain("FEParamGetCondicionIvaReceptor");
    expect(request).toMatch(/<(\w+:)?Token>FICTIONAL-TOKEN-0001<\/(\w+:)?Token>/);
    expect(request).toMatch(/<(\w+:)?Sign>FICTIONAL-SIGN-0001<\/(\w+:)?Sign>/);
    expect(request).toMatch(
      new RegExp(`<(\\w+:)?Cuit>${FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", "")}</(\\w+:)?Cuit>`),
    );
    expect(request).not.toContain("ClaseCmp");
  });

  it("hands over the raw answer ARCA gave", async () => {
    const received: string[] = [];
    const source = new WsfeBuyerTaxStatusSource({
      endpoint: server.endpoint,
      cuit: FICTIONAL_CERTIFICATE_CUIT,
      onRawResponse: (raw) => received.push(raw),
    });

    await source.fetchBuyerTaxStatusSet(token);

    const responses = new URL("./test-support/wsfe-responses/", import.meta.url);
    expect(received).toEqual([
      readFileSync(new URL("fe-param-get-condicion-iva-receptor.xml", responses), "utf8").trim(),
    ]);
  });

  it.each([
    [
      "ARCA answers an error instead of the values",
      answers("fe-param-get-condicion-iva-receptor-token-error.xml"),
    ],
    [
      "ARCA answers an error beside the values",
      answers("fe-param-get-condicion-iva-receptor-with-errors.xml"),
    ],
    [
      "a value comes without its code",
      answers("fe-param-get-condicion-iva-receptor-missing-id.xml"),
    ],
    [
      "a value comes without its description",
      answers("fe-param-get-condicion-iva-receptor-missing-description.xml"),
    ],
    [
      "a value comes without its invoice classes",
      answers("fe-param-get-condicion-iva-receptor-missing-class.xml"),
    ],
    ["ARCA answers a SOAP fault", answers("fe-dummy-fault.xml", 500)],
    ["the answer is not SOAP", answers("not-soap.txt")],
    ["ARCA never answers within the timeout", { kind: "never-answers" as const }],
  ])("fails when %s", async (_case, behavior) => {
    server.behave(behavior);

    expect(await sourceAt(server.endpoint, 200).fetchBuyerTaxStatusSet(token)).toEqual({
      kind: "failed",
    });
  });

  it("fails when ARCA cannot be reached", async () => {
    expect(await sourceAt(UNREACHABLE_WSFE_ENDPOINT).fetchBuyerTaxStatusSet(token)).toEqual({
      kind: "failed",
    });
  });
});

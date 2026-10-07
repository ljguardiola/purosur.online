import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { FICTIONAL_CERTIFICATE_CUIT_DIGITS, scrubArcaRecording } from "./scrub-arca-recording.js";

const ORIGINAL_TOKEN = "T0K3N-original/with+base64==";
const ORIGINAL_SIGN = "S1GN-original/with+base64==";
const ORIGINAL_ISSUER_CUIT = "33111111112";
const ORIGINAL_HOLDER_CUIT = "20222222223";
const CUIT_PATTERN = /(?<!\d)\d{2}-?\d{8}-?\d(?!\d)/g;

function escaped(xml: string): string {
  return xml.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function loginTicketResponse(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<loginTicketResponse version="1.0">',
    "<header>",
    `<source>SERIALNUMBER=CUIT ${ORIGINAL_ISSUER_CUIT}, CN=wsaahomo, O=AFIP, C=AR</source>`,
    `<destination>SERIALNUMBER=CUIT ${ORIGINAL_HOLDER_CUIT}, CN=holder-alias, O=Holder, C=AR</destination>`,
    "<uniqueId>987654321</uniqueId>",
    "<generationTime>2026-10-01T12:00:00.000-03:00</generationTime>",
    "<expirationTime>2026-10-02T00:00:00.000-03:00</expirationTime>",
    "</header>",
    "<credentials>",
    `<token>${ORIGINAL_TOKEN}</token>`,
    `<sign>${ORIGINAL_SIGN}</sign>`,
    "</credentials>",
    "</loginTicketResponse>",
  ].join("\n");
}

function loginCmsEnvelope(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>' +
    `<loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${escaped(loginTicketResponse())}</loginCmsReturn></loginCmsResponse>` +
    "</soapenv:Body></soapenv:Envelope>"
  );
}

function faultEnvelope(): string {
  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault>' +
    "<faultcode>ns1:coe.alreadyAuthenticated</faultcode>" +
    `<faultstring>El CEE con CUIT ${ORIGINAL_HOLDER_CUIT} ya posee un TA valido</faultstring>` +
    "</soapenv:Fault></soapenv:Body></soapenv:Envelope>"
  );
}

function cuitsIn(text: string): string[] {
  return text.match(CUIT_PATTERN) ?? [];
}

describe("scrubArcaRecording", () => {
  it("replaces the token and the sign inside the escaped login ticket", () => {
    const { text } = scrubArcaRecording(loginCmsEnvelope());

    expect(text).not.toContain(ORIGINAL_TOKEN);
    expect(text).not.toContain(ORIGINAL_SIGN);
    expect(text).toContain("&lt;token&gt;FICTIONAL-TOKEN-0001&lt;/token&gt;");
    expect(text).toContain("&lt;sign&gt;FICTIONAL-SIGN-0001&lt;/sign&gt;");
  });

  it("replaces a token and a sign that are not escaped", () => {
    const { text } = scrubArcaRecording(loginTicketResponse());

    expect(text).not.toContain(ORIGINAL_TOKEN);
    expect(text).not.toContain(ORIGINAL_SIGN);
    expect(text).toContain("<token>FICTIONAL-TOKEN-0001</token>");
    expect(text).toContain("<sign>FICTIONAL-SIGN-0001</sign>");
  });

  it("replaces every CUIT, escaped or not, with the fictional certificate's", () => {
    const { text } = scrubArcaRecording(`${loginCmsEnvelope()}${faultEnvelope()}`);

    expect(cuitsIn(text)).not.toEqual([]);
    expect(new Set(cuitsIn(text))).toEqual(new Set([FICTIONAL_CERTIFICATE_CUIT_DIGITS]));
    expect(text).not.toContain(ORIGINAL_ISSUER_CUIT);
    expect(text).not.toContain(ORIGINAL_HOLDER_CUIT);
  });

  it("replaces a CUIT written with dashes in the same form", () => {
    const { text } = scrubArcaRecording("<detail>20-22222222-3 and 33-11111111-2</detail>");

    expect(text).toBe(
      `<detail>${FICTIONAL_CERTIFICATE_CUIT} and ${FICTIONAL_CERTIFICATE_CUIT}</detail>`,
    );
  });

  it("leaves digits that are not a CUIT alone", () => {
    const answer = "<uniqueId>1234567890</uniqueId><n>123456789012</n>";

    expect(scrubArcaRecording(answer).text).toContain("<n>123456789012</n>");
  });

  it("replaces the unique id and the destination's common name", () => {
    const { text } = scrubArcaRecording(loginCmsEnvelope());

    expect(text).not.toContain("987654321");
    expect(text).toContain("&lt;uniqueId&gt;1234567890&lt;/uniqueId&gt;");
    expect(text).not.toContain("holder-alias");
    expect(text).toContain("CN=comercio-de-prueba");
    expect(text).toContain("CN=wsaahomo");
  });

  it("keeps the rest of the answer as received", () => {
    const { text } = scrubArcaRecording(faultEnvelope());

    expect(text).toContain("<faultcode>ns1:coe.alreadyAuthenticated</faultcode>");
    expect(text).toContain("ya posee un TA valido");
  });

  it("reports each field replaced and how many times, never the values", () => {
    const { replacements } = scrubArcaRecording(loginCmsEnvelope());

    expect(replacements).toEqual([
      { field: "token", count: 1 },
      { field: "sign", count: 1 },
      { field: "CUIT", count: 2 },
      { field: "uniqueId", count: 1 },
      { field: "destination common name", count: 1 },
    ]);
    expect(JSON.stringify(replacements)).not.toContain(ORIGINAL_TOKEN);
    expect(JSON.stringify(replacements)).not.toContain(ORIGINAL_HOLDER_CUIT);
  });

  it("reports nothing for an answer with nothing to replace", () => {
    expect(scrubArcaRecording("<a><AppServer>OK</AppServer></a>")).toEqual({
      text: "<a><AppServer>OK</AppServer></a>",
      replacements: [],
    });
  });

  it("writes the fictional certificate CUIT the domain's fictional identities hold", () => {
    expect(FICTIONAL_CERTIFICATE_CUIT_DIGITS).toBe(FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", ""));
  });
});

import {
  ANOTHER_FICTIONAL_CUIT,
  FICTIONAL_CERTIFICATE_CUIT,
  FICTIONAL_CUIT,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { FICTIONAL_CERTIFICATE_CUIT_DIGITS, scrubArcaRecording } from "./scrub-arca-recording.js";

const ORIGINAL_TOKEN = "T0K3N-original/with+base64==";
const ORIGINAL_SIGN = "S1GN-original/with+base64==";
const ORIGINAL_ISSUER_CUIT = ANOTHER_FICTIONAL_CUIT.replaceAll("-", "");
const ORIGINAL_HOLDER_CUIT = FICTIONAL_CUIT.replaceAll("-", "");
const ORIGINAL_DESTINATION = `SERIALNUMBER=CUIT ${ORIGINAL_HOLDER_CUIT}, CN=holder-alias, O=${FICTIONAL_LEGAL_NAME}, C=AR`;
const FICTIONAL_DESTINATION = `SERIALNUMBER=CUIT ${FICTIONAL_CERTIFICATE_CUIT_DIGITS}, CN=comercio-de-prueba`;
const CUIT_PATTERN = /(?<!\d)\d{2}-?\d{8}-?\d(?!\d)/g;

function escaped(xml: string): string {
  return xml.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function loginTicketResponse(destination = ORIGINAL_DESTINATION): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<loginTicketResponse version="1.0">',
    "<header>",
    `<source>SERIALNUMBER=CUIT ${ORIGINAL_ISSUER_CUIT}, CN=wsaahomo, O=AFIP, C=AR</source>`,
    `<destination>${destination}</destination>`,
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

function loginCmsEnvelope(destination = ORIGINAL_DESTINATION): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>' +
    `<loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${escaped(loginTicketResponse(destination))}</loginCmsReturn></loginCmsResponse>` +
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

function destinationIn(text: string): string | undefined {
  return /(?:<|&lt;)destination(?:>|&gt;)([\s\S]*?)(?:<|&lt;)\/destination(?:>|&gt;)/.exec(
    text,
  )?.[1];
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
    const { text } = scrubArcaRecording(
      `<detail>${FICTIONAL_CUIT} and ${ANOTHER_FICTIONAL_CUIT}</detail>`,
    );

    expect(text).toBe(
      `<detail>${FICTIONAL_CERTIFICATE_CUIT} and ${FICTIONAL_CERTIFICATE_CUIT}</detail>`,
    );
  });

  it("leaves digits that are not a CUIT alone", () => {
    const answer = "<uniqueId>1234567890</uniqueId><n>123456789012</n>";

    expect(scrubArcaRecording(answer).text).toContain("<n>123456789012</n>");
  });

  it("replaces the unique id", () => {
    const { text } = scrubArcaRecording(loginCmsEnvelope());

    expect(text).not.toContain("987654321");
    expect(text).toContain("&lt;uniqueId&gt;1234567890&lt;/uniqueId&gt;");
  });

  it.each([
    `SERIALNUMBER=CUIT ${ORIGINAL_HOLDER_CUIT}, CN=holder-alias, O=${FICTIONAL_LEGAL_NAME}, C=AR`,
    `O=${FICTIONAL_LEGAL_NAME}, CN=holder-alias, C=AR, SERIALNUMBER=CUIT ${ORIGINAL_HOLDER_CUIT}`,
    `C=AR, O=${FICTIONAL_LEGAL_NAME} &amp; Hijos, SERIALNUMBER=CUIT ${ORIGINAL_HOLDER_CUIT}, CN=holder-alias`,
  ])("replaces the whole destination %s with a fictional one", (destination) => {
    for (const answer of [loginTicketResponse(destination), loginCmsEnvelope(destination)]) {
      const { text } = scrubArcaRecording(answer);

      expect(destinationIn(text)).toBe(FICTIONAL_DESTINATION);
      expect(text).not.toContain(FICTIONAL_LEGAL_NAME);
      expect(text).not.toContain("holder-alias");
    }
  });

  it("keeps the source as ARCA wrote it but for its CUIT", () => {
    const { text } = scrubArcaRecording(loginCmsEnvelope());

    expect(text).toContain(
      `SERIALNUMBER=CUIT ${FICTIONAL_CERTIFICATE_CUIT_DIGITS}, CN=wsaahomo, O=AFIP, C=AR`,
    );
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
      { field: "destination", count: 1 },
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

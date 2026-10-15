import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generationStampOf } from "@purosur/domain";
import {
  FICTIONAL_CERTIFICATE_CUIT,
  FICTIONAL_CUIT,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import type {
  OfflineAuthorizationCodeRequestAnswer,
  OfflineDocumentReportAnswer,
} from "@purosur/domain/fiscal/use-cases";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ARCA_CERTIFICATE_WITH_WRONG_CHECK_DIGIT,
  ARCA_CERTIFICATE_WITHOUT_SERIAL_NUMBER,
  VALID_ARCA_CERTIFICATE,
} from "../test-support/arca-certificate-fixtures.js";
import {
  type ArcaRecordingReport,
  recordArcaResponses,
  recordingFailure,
  recordingSettingsOf,
  recordingsCarrying15014,
} from "./arca-response-recording.js";
import {
  type ArcaTestCredentials,
  generateArcaTestCredentials,
} from "./test-support/arca-test-credentials.js";
import {
  answerOf,
  answersInTurn,
  type FakeWsaaServer,
  readLoginRequest,
  recordedAnswer,
  startFakeWsaaServer,
  answers as wsaaAnswers,
} from "./test-support/fake-wsaa-server.js";
import {
  type FakeWsfeServer,
  NO_ANSWER,
  startFakeWsfeServer,
  answersInTurn as wsfeAnswersInTurn,
} from "./test-support/fake-wsfe-server.js";

const NOW = new Date("2026-10-01T15:00:00.000Z");
const ORIGINAL_TOKEN = "T0K3N-original/with+base64==";
const ORIGINAL_SIGN = "S1GN-original/with+base64==";
const POINT_OF_SALE = 7;
const OFFLINE_POINT_OF_SALE = 8;
const OFFLINE_AUTHORIZATION_CODE = "36123456789012";
const INVALID_BUYER_TAX_STATUS_CODE = "99999";
const ORIGINAL_CUIT = FICTIONAL_CUIT.replaceAll("-", "");
const INVOICING_ANSWERS = [
  "fe-dummy-all-ok.xml",
  "fe-param-get-condicion-iva-receptor.xml",
  "fe-param-get-condicion-iva-receptor-token-error.xml",
  "fe-comp-ultimo-autorizado.xml",
  "fe-cae-solicitar-authorized.xml",
  "fe-cae-solicitar-rejected-content.xml",
  "fe-cae-solicitar-rejected-out-of-order.xml",
];
const OFFLINE_AUTHORIZATION_CODE_ANSWERS = [
  "fe-caea-consultar-not-granted.xml",
  "fe-caea-solicitar-granted.xml",
  "fe-caea-solicitar-already-granted.xml",
  "fe-caea-consultar-granted.xml",
  "fe-caea-consultar-token-error.xml",
  "fe-caea-solicitar-out-of-window.xml",
];
const OFFLINE_DOCUMENT_REPORT_ANSWERS = [
  "fe-comp-tot-x-request.xml",
  "fe-comp-tot-x-request-token-error.xml",
  "fe-caea-consultar-granted.xml",
  "fe-comp-ultimo-autorizado.xml",
  "fe-caea-reg-informativo-accepted.xml",
  "fe-caea-reg-informativo-partly-rejected.xml",
  "fe-caea-reg-informativo-refused.xml",
  "fe-caea-reg-informativo-token-error.xml",
  "fe-comp-consultar-found.xml",
];
const FIRST_OFFLINE_AUTHORIZATION_CODE_CALL = INVOICING_ANSWERS.length;
const FIRST_OFFLINE_DOCUMENT_REPORT_CALL =
  FIRST_OFFLINE_AUTHORIZATION_CODE_CALL + OFFLINE_AUTHORIZATION_CODE_ANSWERS.length;

let wsaa: FakeWsaaServer;
let wsfe: FakeWsfeServer;
let credentials: ArcaTestCredentials;
let outDir: string;

beforeAll(async () => {
  wsaa = await startFakeWsaaServer();
  wsfe = await startFakeWsfeServer();
  credentials = generateArcaTestCredentials();
});

afterAll(async () => {
  await wsaa.close();
  await wsfe.close();
});

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), "purosur-arca-recording-"));
  wsaa.requests.length = 0;
  wsfe.requests.length = 0;
  wsaa.behave(
    answersInTurn(
      answerOf(unscrubbedLogin()),
      recordedAnswer("already-authenticated-fault.xml", 500),
    ),
  );
  wsfe.behave(
    wsfeAnswersInTurn(
      "fe-dummy-all-ok.xml",
      "fe-param-get-condicion-iva-receptor.xml",
      "fe-param-get-condicion-iva-receptor-token-error.xml",
      "fe-comp-ultimo-autorizado.xml",
      "fe-cae-solicitar-authorized.xml",
      "fe-cae-solicitar-rejected-content.xml",
      "fe-cae-solicitar-rejected-out-of-order.xml",
      ...OFFLINE_AUTHORIZATION_CODE_ANSWERS,
      ...OFFLINE_DOCUMENT_REPORT_ANSWERS,
    ),
  );
});

afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

function record(options: { now?: () => Date } = {}) {
  return recordArcaResponses({
    certificatePem: credentials.certificatePem,
    privateKeyPem: credentials.privateKeyPem,
    outDir,
    wsaaEndpoint: wsaa.endpoint,
    wsfeEndpoint: wsfe.endpoint,
    cuit: FICTIONAL_CERTIFICATE_CUIT,
    pointOfSale: POINT_OF_SALE,
    offlinePointOfSale: OFFLINE_POINT_OF_SALE,
    now: () => NOW,
    ...options,
  });
}

function operationOf(request: string): string | undefined {
  return /<(?:\w+:)?(FE[A-Za-z]+) xmlns/.exec(request)?.[1];
}

function sent(request: string | undefined, element: string): string | undefined {
  return new RegExp(`<(?:\\w+:)?${element}>([^<]*)</(?:\\w+:)?${element}>`).exec(
    request ?? "",
  )?.[1];
}

function fixture(directory: string, name: string): string {
  return readFileSync(
    new URL(`./test-support/${directory}/${name}`, import.meta.url),
    "utf8",
  ).trim();
}

function unscrubbedLogin(): string {
  return fixture("wsaa-responses", "login-cms-issued.xml")
    .replace("FICTIONAL-TOKEN-0001", ORIGINAL_TOKEN)
    .replace("FICTIONAL-SIGN-0001", ORIGINAL_SIGN)
    .replace("&lt;uniqueId&gt;1234567890", "&lt;uniqueId&gt;987654321")
    .replaceAll(FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", ""), ORIGINAL_CUIT)
    .replace("CN=comercio-de-prueba", `CN=holder-alias, O=${FICTIONAL_LEGAL_NAME}, C=AR`);
}

describe("recordArcaResponses", () => {
  it("saves the raw answer of FEDummy, of a login and of the login refused right after it", async () => {
    await record();

    expect(readFileSync(join(outDir, "fe-dummy.raw.xml"), "utf8")).toBe(
      fixture("wsfe-responses", "fe-dummy-all-ok.xml"),
    );
    expect(readFileSync(join(outDir, "login-cms-issued.raw.xml"), "utf8")).toBe(unscrubbedLogin());
    expect(readFileSync(join(outDir, "fe-param-get-condicion-iva-receptor.raw.xml"), "utf8")).toBe(
      fixture("wsfe-responses", "fe-param-get-condicion-iva-receptor.xml"),
    );
    expect(
      readFileSync(join(outDir, "fe-param-get-condicion-iva-receptor-token-error.raw.xml"), "utf8"),
    ).toBe(fixture("wsfe-responses", "fe-param-get-condicion-iva-receptor-token-error.xml"));
    expect(readFileSync(join(outDir, "login-cms-already-authenticated.raw.xml"), "utf8")).toBe(
      fixture("wsaa-responses", "already-authenticated-fault.xml"),
    );
  });

  it("saves the raw answers of the last authorized number and of the three invoices", async () => {
    await record();

    for (const name of [
      "fe-comp-ultimo-autorizado",
      "fe-cae-solicitar-authorized",
      "fe-cae-solicitar-rejected-content",
      "fe-cae-solicitar-rejected-out-of-order",
    ]) {
      expect(readFileSync(join(outDir, `${name}.raw.xml`), "utf8")).toBe(
        fixture("wsfe-responses", `${name}.xml`),
      );
    }
  });

  it("makes exactly one FEDummy call, two logins, two buyer tax-status calls, one last-authorized call, three invoice calls, six offline authorization code calls and nine offline document report calls", async () => {
    await record();

    expect(wsfe.requests).toHaveLength(22);
    expect(wsfe.requests.map(operationOf)).toEqual([
      "FEDummy",
      "FEParamGetCondicionIvaReceptor",
      "FEParamGetCondicionIvaReceptor",
      "FECompUltimoAutorizado",
      "FECAESolicitar",
      "FECAESolicitar",
      "FECAESolicitar",
      "FECAEAConsultar",
      "FECAEASolicitar",
      "FECAEASolicitar",
      "FECAEAConsultar",
      "FECAEAConsultar",
      "FECAEASolicitar",
      "FECompTotXRequest",
      "FECompTotXRequest",
      "FECAEAConsultar",
      "FECompUltimoAutorizado",
      "FECAEARegInformativo",
      "FECAEARegInformativo",
      "FECAEARegInformativo",
      "FECAEARegInformativo",
      "FECompConsultar",
    ]);
    expect(wsaa.requests).toHaveLength(2);
  });

  it("asks for the last authorized number of the given point of sale with the issued ticket, before any invoice", async () => {
    await record();

    const lastAuthorized = wsfe.requests[3];
    expect(lastAuthorized).toContain(ORIGINAL_TOKEN);
    expect(lastAuthorized).toContain(ORIGINAL_SIGN);
    expect(sent(lastAuthorized, "PtoVta")).toBe("7");
    expect(sent(lastAuthorized, "CbteTipo")).toBe("11");
  });

  it("invoices the next number to a final consumer, then an invalid buyer tax status for the one after, then the first number again", async () => {
    await record();

    const [authorized, rejected, outOfOrder] = wsfe.requests.slice(4, 7);
    for (const request of [authorized, rejected, outOfOrder]) {
      expect(request).toContain(ORIGINAL_TOKEN);
      expect(request).toContain(ORIGINAL_SIGN);
      expect(sent(request, "PtoVta")).toBe("7");
      expect(sent(request, "CantReg")).toBe("1");
      expect(sent(request, "CbteFch")).toBe("20261001");
    }
    expect([authorized, rejected, outOfOrder].map((request) => sent(request, "CbteDesde"))).toEqual(
      ["2", "3", "2"],
    );
    expect(
      [authorized, rejected, outOfOrder].map((request) => sent(request, "CondicionIVAReceptorId")),
    ).toEqual(["5", INVALID_BUYER_TAX_STATUS_CODE, "5"]);
  });

  it("dates the invoices by the Argentina calendar day of the moment of recording", async () => {
    await record({ now: () => new Date("2026-10-08T01:30:00.000Z") });

    const invoices = wsfe.requests.slice(4, FIRST_OFFLINE_AUTHORIZATION_CODE_CALL);
    expect(invoices.map((request) => sent(request, "CbteFch"))).toEqual([
      "20261007",
      "20261007",
      "20261007",
    ]);
  });

  it("makes no invoice call when the last authorized number is not answered", async () => {
    wsfe.behave(
      wsfeAnswersInTurn(
        "fe-dummy-all-ok.xml",
        "fe-param-get-condicion-iva-receptor.xml",
        "fe-param-get-condicion-iva-receptor-token-error.xml",
        "fe-comp-ultimo-autorizado-token-error.xml",
      ),
    );

    const report = await record();

    expect(wsfe.requests.map(operationOf)).not.toContain("FECAESolicitar");
    expect(report.invoicesRecorded).toBe(false);
    expect(readdirSync(outDir).filter((file) => file.startsWith("fe-cae"))).toEqual([]);
  });

  it("makes no invoice call when ARCA lists no Consumidor Final to invoice", async () => {
    wsfe.behave(
      wsfeAnswersInTurn(
        "fe-dummy-all-ok.xml",
        "fe-param-get-condicion-iva-receptor-token-error.xml",
        "fe-param-get-condicion-iva-receptor-token-error.xml",
      ),
    );

    const report = await record();

    expect(wsfe.requests.map(operationOf).slice(0, 4)).toEqual([
      "FEDummy",
      "FEParamGetCondicionIvaReceptor",
      "FEParamGetCondicionIvaReceptor",
      "FECAEAConsultar",
    ]);
    expect(report.invoicesRecorded).toBe(false);
  });

  it("asks for the buyer tax-status values with the issued ticket and the certificate's CUIT, then with a ticket ARCA never issued", async () => {
    await record();

    const [, withIssuedTicket, withUnissuedTicket] = wsfe.requests;
    expect(withIssuedTicket).toContain("FEParamGetCondicionIvaReceptor");
    expect(withIssuedTicket).toContain(ORIGINAL_TOKEN);
    expect(withIssuedTicket).toContain(ORIGINAL_SIGN);
    expect(withIssuedTicket).toContain(FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", ""));
    expect(withUnissuedTicket).toContain("FEParamGetCondicionIvaReceptor");
    expect(withUnissuedTicket).not.toContain(ORIGINAL_TOKEN);
    expect(withUnissuedTicket).not.toContain(ORIGINAL_SIGN);
  });

  it("asks for no buyer tax-status values when the first login issued no ticket", async () => {
    wsaa.behave(wsaaAnswers("already-authenticated-fault.xml", 500));

    await record();

    expect(wsfe.requests).toHaveLength(1);
    expect(readdirSync(outDir).filter((file) => file.startsWith("fe-param"))).toEqual([]);
    expect(readdirSync(outDir).filter((file) => /^fe-(cae|comp)/.test(file))).toEqual([]);
  });

  it("sends the two logins with different unique ids", async () => {
    await record();

    const uniqueIds = wsaa.requests.map(
      (request) => /<uniqueId>(\d+)<\/uniqueId>/.exec(readLoginRequest(request).signedContent)?.[1],
    );
    expect(uniqueIds[0]).toBeDefined();
    expect(uniqueIds[0]).not.toBe(uniqueIds[1]);
  });

  it("writes a scrubbed copy of each answer beside the raw one, with no original ticket in it", async () => {
    await record();

    expect(readdirSync(outDir).sort()).toEqual([
      "fe-cae-solicitar-authorized.raw.xml",
      "fe-cae-solicitar-authorized.scrubbed.xml",
      "fe-cae-solicitar-rejected-content.raw.xml",
      "fe-cae-solicitar-rejected-content.scrubbed.xml",
      "fe-cae-solicitar-rejected-out-of-order.raw.xml",
      "fe-cae-solicitar-rejected-out-of-order.scrubbed.xml",
      "fe-caea-consultar-granted.raw.xml",
      "fe-caea-consultar-granted.scrubbed.xml",
      "fe-caea-consultar-not-granted.raw.xml",
      "fe-caea-consultar-not-granted.scrubbed.xml",
      "fe-caea-consultar-token-error.raw.xml",
      "fe-caea-consultar-token-error.scrubbed.xml",
      "fe-caea-reg-informativo-accepted.raw.xml",
      "fe-caea-reg-informativo-accepted.scrubbed.xml",
      "fe-caea-reg-informativo-partly-rejected.raw.xml",
      "fe-caea-reg-informativo-partly-rejected.scrubbed.xml",
      "fe-caea-reg-informativo-refused.raw.xml",
      "fe-caea-reg-informativo-refused.scrubbed.xml",
      "fe-caea-reg-informativo-token-error.raw.xml",
      "fe-caea-reg-informativo-token-error.scrubbed.xml",
      "fe-caea-solicitar-already-granted.raw.xml",
      "fe-caea-solicitar-already-granted.scrubbed.xml",
      "fe-caea-solicitar-granted.raw.xml",
      "fe-caea-solicitar-granted.scrubbed.xml",
      "fe-caea-solicitar-out-of-window.raw.xml",
      "fe-caea-solicitar-out-of-window.scrubbed.xml",
      "fe-comp-consultar-caea-found.raw.xml",
      "fe-comp-consultar-caea-found.scrubbed.xml",
      "fe-comp-tot-x-request-token-error.raw.xml",
      "fe-comp-tot-x-request-token-error.scrubbed.xml",
      "fe-comp-tot-x-request.raw.xml",
      "fe-comp-tot-x-request.scrubbed.xml",
      "fe-comp-ultimo-autorizado-offline.raw.xml",
      "fe-comp-ultimo-autorizado-offline.scrubbed.xml",
      "fe-comp-ultimo-autorizado.raw.xml",
      "fe-comp-ultimo-autorizado.scrubbed.xml",
      "fe-dummy.raw.xml",
      "fe-dummy.scrubbed.xml",
      "fe-param-get-condicion-iva-receptor-token-error.raw.xml",
      "fe-param-get-condicion-iva-receptor-token-error.scrubbed.xml",
      "fe-param-get-condicion-iva-receptor.raw.xml",
      "fe-param-get-condicion-iva-receptor.scrubbed.xml",
      "login-cms-already-authenticated.raw.xml",
      "login-cms-already-authenticated.scrubbed.xml",
      "login-cms-issued.raw.xml",
      "login-cms-issued.scrubbed.xml",
    ]);
    const scrubbed = readFileSync(join(outDir, "login-cms-issued.scrubbed.xml"), "utf8");
    expect(scrubbed).not.toContain(ORIGINAL_TOKEN);
    expect(scrubbed).not.toContain(ORIGINAL_SIGN);
    expect(scrubbed).not.toContain(ORIGINAL_CUIT);
    expect(scrubbed).not.toContain(FICTIONAL_LEGAL_NAME);
    expect(scrubbed).toBe(fixture("wsaa-responses", "login-cms-issued.xml"));
  });

  it("reports what it replaced in each file, by field and count", async () => {
    const report = await record();

    expect(report.scrubbed).toEqual([
      { file: "fe-dummy.scrubbed.xml", replacements: [] },
      {
        file: "login-cms-issued.scrubbed.xml",
        replacements: [
          { field: "token", count: 1 },
          { field: "sign", count: 1 },
          { field: "CUIT", count: 2 },
          { field: "uniqueId", count: 1 },
          { field: "destination", count: 1 },
        ],
      },
      { file: "fe-param-get-condicion-iva-receptor.scrubbed.xml", replacements: [] },
      {
        file: "fe-param-get-condicion-iva-receptor-token-error.scrubbed.xml",
        replacements: [],
      },
      { file: "fe-comp-ultimo-autorizado.scrubbed.xml", replacements: [] },
      {
        file: "fe-cae-solicitar-authorized.scrubbed.xml",
        replacements: [
          { field: "CAE", count: 1 },
          { field: "CUIT", count: 1 },
        ],
      },
      {
        file: "fe-cae-solicitar-rejected-content.scrubbed.xml",
        replacements: [{ field: "CUIT", count: 1 }],
      },
      {
        file: "fe-cae-solicitar-rejected-out-of-order.scrubbed.xml",
        replacements: [{ field: "CUIT", count: 1 }],
      },
      { file: "fe-caea-consultar-not-granted.scrubbed.xml", replacements: [] },
      {
        file: "fe-caea-solicitar-granted.scrubbed.xml",
        replacements: [{ field: "CAEA", count: 1 }],
      },
      { file: "fe-caea-solicitar-already-granted.scrubbed.xml", replacements: [] },
      {
        file: "fe-caea-consultar-granted.scrubbed.xml",
        replacements: [{ field: "CAEA", count: 1 }],
      },
      { file: "fe-caea-consultar-token-error.scrubbed.xml", replacements: [] },
      { file: "fe-caea-solicitar-out-of-window.scrubbed.xml", replacements: [] },
      { file: "fe-comp-tot-x-request.scrubbed.xml", replacements: [] },
      { file: "fe-comp-tot-x-request-token-error.scrubbed.xml", replacements: [] },
      { file: "fe-comp-ultimo-autorizado-offline.scrubbed.xml", replacements: [] },
      {
        file: "fe-caea-reg-informativo-accepted.scrubbed.xml",
        replacements: [
          { field: "CAEA", count: 2 },
          { field: "CUIT", count: 1 },
        ],
      },
      {
        file: "fe-caea-reg-informativo-partly-rejected.scrubbed.xml",
        replacements: [
          { field: "CAEA", count: 3 },
          { field: "CUIT", count: 1 },
        ],
      },
      { file: "fe-caea-reg-informativo-refused.scrubbed.xml", replacements: [] },
      { file: "fe-caea-reg-informativo-token-error.scrubbed.xml", replacements: [] },
      {
        file: "fe-comp-consultar-caea-found.scrubbed.xml",
        replacements: [{ field: "CodAutorizacion", count: 1 }],
      },
      { file: "login-cms-already-authenticated.scrubbed.xml", replacements: [] },
    ]);
  });

  it("says whether the first login issued a ticket", async () => {
    expect((await record()).firstLoginIssuedTicket).toBe(true);

    wsaa.behave(wsaaAnswers("already-authenticated-fault.xml", 500));
    wsaa.requests.length = 0;
    expect((await record()).firstLoginIssuedTicket).toBe(false);
  });

  it("refuses when ARCA gives no answer to record, naming the call", async () => {
    wsfe.behave({ kind: "never-answers" });

    await expect(
      recordArcaResponses({
        certificatePem: credentials.certificatePem,
        privateKeyPem: credentials.privateKeyPem,
        outDir,
        wsaaEndpoint: wsaa.endpoint,
        wsfeEndpoint: wsfe.endpoint,
        cuit: FICTIONAL_CERTIFICATE_CUIT,
        pointOfSale: POINT_OF_SALE,
        offlinePointOfSale: OFFLINE_POINT_OF_SALE,
        now: () => NOW,
        timeoutMs: 200,
      }),
    ).rejects.toThrow("FEDummy");
  });

  it("refuses when ARCA gives no answer to the buyer tax-status call, naming it", async () => {
    wsfe.behave(wsfeAnswersInTurn("fe-dummy-all-ok.xml", NO_ANSWER));

    await expect(
      recordArcaResponses({
        certificatePem: credentials.certificatePem,
        privateKeyPem: credentials.privateKeyPem,
        outDir,
        wsaaEndpoint: wsaa.endpoint,
        wsfeEndpoint: wsfe.endpoint,
        cuit: FICTIONAL_CERTIFICATE_CUIT,
        pointOfSale: POINT_OF_SALE,
        offlinePointOfSale: OFFLINE_POINT_OF_SALE,
        now: () => NOW,
        timeoutMs: 200,
      }),
    ).rejects.toThrow("FEParamGetCondicionIvaReceptor");
  });
});

describe("recordArcaResponses invoicing calls", () => {
  it("refuses when ARCA gives no answer to the last authorized call, naming it", async () => {
    wsfe.behave(
      wsfeAnswersInTurn(
        "fe-dummy-all-ok.xml",
        "fe-param-get-condicion-iva-receptor.xml",
        "fe-param-get-condicion-iva-receptor-token-error.xml",
        NO_ANSWER,
      ),
    );

    await expect(
      recordArcaResponses({
        certificatePem: credentials.certificatePem,
        privateKeyPem: credentials.privateKeyPem,
        outDir,
        wsaaEndpoint: wsaa.endpoint,
        wsfeEndpoint: wsfe.endpoint,
        cuit: FICTIONAL_CERTIFICATE_CUIT,
        pointOfSale: POINT_OF_SALE,
        offlinePointOfSale: OFFLINE_POINT_OF_SALE,
        now: () => NOW,
        timeoutMs: 200,
      }),
    ).rejects.toThrow("FECompUltimoAutorizado");
  });
});

describe("recordArcaResponses offline authorization code calls", () => {
  const codeCalls = (count = OFFLINE_AUTHORIZATION_CODE_ANSWERS.length) =>
    wsfe.requests.slice(
      FIRST_OFFLINE_AUTHORIZATION_CODE_CALL,
      FIRST_OFFLINE_AUTHORIZATION_CODE_CALL + count,
    );
  const periodsOf = (requests: string[]) =>
    requests.map((request) => `${sent(request, "Periodo")}/${sent(request, "Orden")}`);

  it("looks up the fortnight whose window is open, requests its code twice and looks it up again, all with the issued ticket", async () => {
    await record();

    const [notGranted, granted, alreadyGranted, lookedUp] = codeCalls();
    for (const request of [notGranted, granted, alreadyGranted, lookedUp]) {
      expect(request).toContain(ORIGINAL_TOKEN);
      expect(request).toContain(ORIGINAL_SIGN);
      expect(sent(request, "Cuit")).toBe(FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", ""));
    }
    expect(periodsOf([notGranted, granted, alreadyGranted, lookedUp] as string[])).toEqual([
      "202610/1",
      "202610/1",
      "202610/1",
      "202610/1",
    ]);
  });

  it("looks the code up once more with a ticket ARCA never issued", async () => {
    await record();

    const withUnissuedTicket = codeCalls()[4];
    expect(operationOf(withUnissuedTicket as string)).toBe("FECAEAConsultar");
    expect(withUnissuedTicket).not.toContain(ORIGINAL_TOKEN);
    expect(withUnissuedTicket).not.toContain(ORIGINAL_SIGN);
    expect(periodsOf([withUnissuedTicket as string])).toEqual(["202610/1"]);
  });

  it("requests last the code of a fortnight whose window has not opened", async () => {
    await record();

    const outOfWindow = codeCalls()[5];
    expect(operationOf(outOfWindow as string)).toBe("FECAEASolicitar");
    expect(periodsOf([outOfWindow as string])).toEqual(["202611/1"]);
  });

  it("tries the next fortnight first once its window opened in Argentina", async () => {
    await record({ now: () => new Date("2026-10-11T03:00:00.000Z") });

    expect(periodsOf(codeCalls())).toEqual([
      "202610/2",
      "202610/2",
      "202610/2",
      "202610/2",
      "202610/2",
      "202611/2",
    ]);
  });

  it("falls back to the current fortnight when the next one's code is already granted", async () => {
    wsfe.behave(
      wsfeAnswersInTurn(
        ...INVOICING_ANSWERS,
        "fe-caea-consultar-granted.xml",
        ...OFFLINE_AUTHORIZATION_CODE_ANSWERS,
        ...OFFLINE_DOCUMENT_REPORT_ANSWERS,
      ),
    );

    await record({ now: () => new Date("2026-10-11T03:00:00.000Z") });

    expect(codeCalls(7).map(operationOf)).toEqual([
      "FECAEAConsultar",
      "FECAEAConsultar",
      "FECAEASolicitar",
      "FECAEASolicitar",
      "FECAEAConsultar",
      "FECAEAConsultar",
      "FECAEASolicitar",
    ]);
    expect(periodsOf(codeCalls(7))).toEqual([
      "202610/2",
      "202610/1",
      "202610/1",
      "202610/1",
      "202610/1",
      "202610/1",
      "202611/2",
    ]);
  });

  it("requests no code when every fortnight whose window is open already holds one", async () => {
    wsfe.behave(
      wsfeAnswersInTurn(
        ...INVOICING_ANSWERS,
        "fe-caea-consultar-granted.xml",
        ...OFFLINE_DOCUMENT_REPORT_ANSWERS,
      ),
    );

    const report = await record();

    expect(codeCalls(1).map(operationOf)).toEqual(["FECAEAConsultar"]);
    expect(report.offlineAuthorizationCodeRequests).toBeUndefined();
    expect(readdirSync(outDir).filter((file) => file.startsWith("fe-caea"))).toEqual([]);
  });

  it("saves the raw answer of each offline authorization code call", async () => {
    const report = await record();

    expect(report.offlineAuthorizationCodeRequests).toBeDefined();
    for (const [name, served] of [
      ["fe-caea-consultar-not-granted", "fe-caea-consultar-not-granted"],
      ["fe-caea-solicitar-granted", "fe-caea-solicitar-granted"],
      ["fe-caea-solicitar-already-granted", "fe-caea-solicitar-already-granted"],
      ["fe-caea-consultar-granted", "fe-caea-consultar-granted"],
      ["fe-caea-consultar-token-error", "fe-caea-consultar-token-error"],
      ["fe-caea-solicitar-out-of-window", "fe-caea-solicitar-out-of-window"],
    ]) {
      expect(readFileSync(join(outDir, `${name}.raw.xml`), "utf8")).toBe(
        fixture("wsfe-responses", `${served}.xml`),
      );
    }
  });

  const OUT_OF_WINDOW_REFUSAL =
    "15006: Fecha de envío podrá ser desde 5 días corridos anteriores al inicio hasta el último dia de cada quincena. Del 26/11/2026 hasta 15/12/2026";

  it("fails the recording, naming what ARCA answered, when the first code request is refused", async () => {
    wsfe.behave(
      wsfeAnswersInTurn(
        ...INVOICING_ANSWERS,
        "fe-caea-consultar-not-granted.xml",
        "fe-caea-solicitar-out-of-window.xml",
        "fe-caea-solicitar-out-of-window.xml",
        "fe-caea-consultar-granted.xml",
        "fe-caea-consultar-token-error.xml",
        "fe-caea-solicitar-out-of-window.xml",
        ...OFFLINE_DOCUMENT_REPORT_ANSWERS,
      ),
    );

    expect(recordingFailure(await record())).toBe(
      `the first FECAEASolicitar granted no offline authorization code; ARCA answered ${OUT_OF_WINDOW_REFUSAL}`,
    );
  });

  it("fails the recording, naming what ARCA answered, when the second code request is refused for another reason than the code being already granted", async () => {
    wsfe.behave(
      wsfeAnswersInTurn(
        ...INVOICING_ANSWERS,
        "fe-caea-consultar-not-granted.xml",
        "fe-caea-solicitar-granted.xml",
        "fe-caea-solicitar-out-of-window.xml",
        "fe-caea-consultar-granted.xml",
        "fe-caea-consultar-token-error.xml",
        "fe-caea-solicitar-out-of-window.xml",
        ...OFFLINE_DOCUMENT_REPORT_ANSWERS,
      ),
    );

    expect(recordingFailure(await record())).toBe(
      `the second FECAEASolicitar did not answer that the code was already granted; ARCA answered ${OUT_OF_WINDOW_REFUSAL}`,
    );
  });

  it("finds nothing wrong when the first code request is granted and the second answers that it already was", async () => {
    expect(recordingFailure(await record())).toBeUndefined();
  });

  it("refuses when ARCA gives no answer to the first lookup, naming it", async () => {
    wsfe.behave(wsfeAnswersInTurn(...INVOICING_ANSWERS, NO_ANSWER));

    await expect(
      recordArcaResponses({
        certificatePem: credentials.certificatePem,
        privateKeyPem: credentials.privateKeyPem,
        outDir,
        wsaaEndpoint: wsaa.endpoint,
        wsfeEndpoint: wsfe.endpoint,
        cuit: FICTIONAL_CERTIFICATE_CUIT,
        pointOfSale: POINT_OF_SALE,
        offlinePointOfSale: OFFLINE_POINT_OF_SALE,
        now: () => NOW,
        timeoutMs: 200,
      }),
    ).rejects.toThrow("FECAEAConsultar");
  });
});

describe("recordArcaResponses offline document report calls", () => {
  const reportCalls = () =>
    wsfe.requests.slice(FIRST_OFFLINE_DOCUMENT_REPORT_CALL, FIRST_OFFLINE_DOCUMENT_REPORT_CALL + 9);
  const [TOT_X, TOT_X_UNISSUED, LOOKUP, LAST, ACCEPTED, PARTLY_REJECTED, REFUSED, UNISSUED, FOUND] =
    [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
  const requestsOf = (...positions: number[]) =>
    positions.map((position) => reportCalls()[position] as string);

  it("asks for the batch limit with the issued ticket and then with a ticket ARCA never issued", async () => {
    await record();

    const [withIssuedTicket, withUnissuedTicket] = requestsOf(TOT_X, TOT_X_UNISSUED);
    expect(withIssuedTicket).toContain(ORIGINAL_TOKEN);
    expect(withIssuedTicket).toContain(ORIGINAL_SIGN);
    expect(withUnissuedTicket).not.toContain(ORIGINAL_TOKEN);
    expect(withUnissuedTicket).not.toContain(ORIGINAL_SIGN);
  });

  it("looks up the code of the fortnight that contains today, even when the next fortnight's window is open", async () => {
    await record({ now: () => new Date("2026-10-11T03:00:00.000Z") });

    const [lookup] = requestsOf(LOOKUP);
    expect(lookup).toContain(ORIGINAL_TOKEN);
    expect(`${sent(lookup, "Periodo")}/${sent(lookup, "Orden")}`).toBe("202610/1");
  });

  it("reads the last authorized number of Factura C on the offline point of sale", async () => {
    await record();

    const [last] = requestsOf(LAST);
    expect(last).toContain(ORIGINAL_TOKEN);
    expect(sent(last, "PtoVta")).toBe("8");
    expect(sent(last, "CbteTipo")).toBe("11");
  });

  it("reports one document, then three of which the middle one has a net amount different from its total, then one out of sequence, then one with a ticket ARCA never issued, all with the current code; a successful run consumes only the numbers after the last one reported that ARCA accepts", async () => {
    await record();

    const reports = requestsOf(ACCEPTED, PARTLY_REJECTED, REFUSED, UNISSUED);
    for (const request of reports) {
      expect(sent(request, "PtoVta")).toBe("8");
      expect(sent(request, "CbteTipo")).toBe("11");
      expect(request).toContain(`<CAEA>${OFFLINE_AUTHORIZATION_CODE}</CAEA>`);
    }
    expect(reports.map((request) => sent(request, "CantReg"))).toEqual(["1", "3", "1", "1"]);
    expect(
      reports.map((request) => [...request.matchAll(/<CbteDesde>(\d+)</g)].map(([, n]) => n)),
    ).toEqual([["2"], ["3", "4", "5"], ["11"], ["4"]]);
    expect(reports[0]).toContain(ORIGINAL_TOKEN);
    expect(reports[1]).toContain(ORIGINAL_TOKEN);
    expect(reports[2]).toContain(ORIGINAL_TOKEN);
    expect(reports[3]).not.toContain(ORIGINAL_TOKEN);
  });

  it("reports final consumer documents of 100,00 dated today and generated now", async () => {
    await record();

    const [accepted, partlyRejected] = requestsOf(ACCEPTED, PARTLY_REJECTED);
    expect(sent(accepted, "CbteFch")).toBe("20261001");
    expect(sent(accepted, "CbteFchHsGen")).toBe(generationStampOf(NOW));
    expect(sent(accepted, "DocTipo")).toBe("99");
    expect(sent(accepted, "DocNro")).toBe("0");
    expect(sent(accepted, "CondicionIVAReceptorId")).toBe("5");
    expect(sent(accepted, "ImpTotal")).toBe("100.00");
    expect(sent(accepted, "ImpNeto")).toBe("100.00");
    expect(
      [...(partlyRejected as string).matchAll(/<ImpTotal>([\d.]+)</g)].map(([, n]) => n),
    ).toEqual(["100.00", "100.00", "100.00"]);
    expect(
      [...(partlyRejected as string).matchAll(/<ImpNeto>([\d.]+)</g)].map(([, n]) => n),
    ).toEqual(["100.00", "50.00", "100.00"]);
  });

  it("looks up the first reported document on the offline point of sale", async () => {
    await record();

    const [found] = requestsOf(FOUND);
    expect(found).toContain(ORIGINAL_TOKEN);
    expect(sent(found, "PtoVta")).toBe("8");
    expect(sent(found, "CbteTipo")).toBe("11");
    expect(sent(found, "CbteNro")).toBe("2");
  });

  it("saves the raw answer of each offline document report call", async () => {
    await record();

    for (const [name, served] of [
      ["fe-comp-tot-x-request", "fe-comp-tot-x-request"],
      ["fe-comp-tot-x-request-token-error", "fe-comp-tot-x-request-token-error"],
      ["fe-comp-ultimo-autorizado-offline", "fe-comp-ultimo-autorizado"],
      ["fe-caea-reg-informativo-accepted", "fe-caea-reg-informativo-accepted"],
      ["fe-caea-reg-informativo-partly-rejected", "fe-caea-reg-informativo-partly-rejected"],
      ["fe-caea-reg-informativo-refused", "fe-caea-reg-informativo-refused"],
      ["fe-caea-reg-informativo-token-error", "fe-caea-reg-informativo-token-error"],
      ["fe-comp-consultar-caea-found", "fe-comp-consultar-found"],
    ]) {
      expect(readFileSync(join(outDir, `${name}.raw.xml`), "utf8")).toBe(
        fixture("wsfe-responses", `${served}.xml`),
      );
    }
  });

  it("reports the last reported number and what ARCA answered to the two reports", async () => {
    const report = await record();

    expect(report.currentFortnightCodeGranted).toBe(true);
    expect(report.offlineDocumentReports).toEqual({
      lastReportedNumber: 1,
      accepted: { kind: "accepted" },
      partlyRejected: {
        kind: "rejected",
        number: 4,
        rejections: [
          {
            code: 1439,
            message: "El importe total no coincide con la suma de los importes informados.",
          },
        ],
      },
    });
    expect(recordingFailure(report)).toBeUndefined();
  });

  it("requests the current fortnight's code, recording both answers, when it is not granted yet", async () => {
    wsfe.behave(
      wsfeAnswersInTurn(
        ...INVOICING_ANSWERS,
        ...OFFLINE_AUTHORIZATION_CODE_ANSWERS,
        "fe-comp-tot-x-request.xml",
        "fe-comp-tot-x-request-token-error.xml",
        "fe-caea-consultar-not-granted.xml",
        "fe-caea-solicitar-granted.xml",
        "fe-comp-ultimo-autorizado.xml",
        "fe-caea-reg-informativo-accepted.xml",
        "fe-caea-reg-informativo-partly-rejected.xml",
        "fe-caea-reg-informativo-refused.xml",
        "fe-caea-reg-informativo-token-error.xml",
        "fe-comp-consultar-found.xml",
      ),
    );

    const report = await record();

    const calls = reportCalls();
    expect(calls.slice(2, 5).map(operationOf)).toEqual([
      "FECAEAConsultar",
      "FECAEASolicitar",
      "FECompUltimoAutorizado",
    ]);
    expect(`${sent(calls[3], "Periodo")}/${sent(calls[3], "Orden")}`).toBe("202610/1");
    expect(calls[3]).toContain(ORIGINAL_TOKEN);
    expect(calls[5]).toContain(`<CAEA>${OFFLINE_AUTHORIZATION_CODE}</CAEA>`);
    for (const [name, served] of [
      ["fe-caea-consultar-current-not-granted", "fe-caea-consultar-not-granted"],
      ["fe-caea-solicitar-current-granted", "fe-caea-solicitar-granted"],
    ]) {
      expect(readFileSync(join(outDir, `${name}.raw.xml`), "utf8")).toBe(
        fixture("wsfe-responses", `${served}.xml`),
      );
    }
    expect(report.currentFortnightCodeGranted).toBe(true);
    expect(recordingFailure(report)).toBeUndefined();
  });

  it.each([
    ["is refused", "fe-caea-solicitar-out-of-window.xml"],
    ["is not answered", NO_ANSWER],
  ])(
    "records nothing more and fails the recording when the current fortnight's code request %s",
    async (_outcome, requestAnswer) => {
      wsfe.behave(
        wsfeAnswersInTurn(
          ...INVOICING_ANSWERS,
          ...OFFLINE_AUTHORIZATION_CODE_ANSWERS,
          "fe-comp-tot-x-request.xml",
          "fe-comp-tot-x-request-token-error.xml",
          "fe-caea-consultar-not-granted.xml",
          requestAnswer,
        ),
      );

      const report = await record();

      expect(reportCalls().map(operationOf)).toEqual([
        "FECompTotXRequest",
        "FECompTotXRequest",
        "FECAEAConsultar",
        "FECAEASolicitar",
      ]);
      expect(readdirSync(outDir).filter((file) => file.startsWith("fe-caea-reg"))).toEqual([]);
      expect(report.currentFortnightCodeGranted).toBe(false);
      expect(report.offlineDocumentReports).toBeUndefined();
      expect(recordingFailure(report)).toBe(
        "the offline authorization code of the current fortnight is not granted, so no document was reported",
      );
    },
  );

  it("reports no document when the lookup of the current fortnight's code is refused", async () => {
    wsfe.behave(
      wsfeAnswersInTurn(
        ...INVOICING_ANSWERS,
        ...OFFLINE_AUTHORIZATION_CODE_ANSWERS,
        "fe-comp-tot-x-request.xml",
        "fe-comp-tot-x-request-token-error.xml",
        "fe-caea-consultar-token-error.xml",
      ),
    );

    await record();

    expect(reportCalls().map(operationOf)).toEqual([
      "FECompTotXRequest",
      "FECompTotXRequest",
      "FECAEAConsultar",
    ]);
  });

  it("reports no document when the last reported number on the offline point of sale is not read", async () => {
    wsfe.behave(
      wsfeAnswersInTurn(
        ...INVOICING_ANSWERS,
        ...OFFLINE_AUTHORIZATION_CODE_ANSWERS,
        ...OFFLINE_DOCUMENT_REPORT_ANSWERS.slice(0, 3),
        "fe-comp-ultimo-autorizado-token-error.xml",
      ),
    );

    const report = await record();

    expect(reportCalls().map(operationOf)).toEqual([
      "FECompTotXRequest",
      "FECompTotXRequest",
      "FECAEAConsultar",
      "FECompUltimoAutorizado",
    ]);
    expect(report.currentFortnightCodeGranted).toBe(true);
    expect(report.offlineDocumentReports).toBeUndefined();
    expect(recordingFailure(report)).toBe(
      "ARCA gave no last reported number on the offline point of sale, so no document was reported",
    );
  });

  it("lists no recording carrying observation 15014 when none does", async () => {
    expect((await record()).recordingsCarrying15014).toEqual([]);
  });

  it("lists the recordings carrying observation 15014", async () => {
    wsfe.behave(
      wsfeAnswersInTurn(
        ...INVOICING_ANSWERS,
        ...OFFLINE_AUTHORIZATION_CODE_ANSWERS,
        ...OFFLINE_DOCUMENT_REPORT_ANSWERS.slice(0, 4),
        "fe-caea-reg-informativo-accepted-with-observation.xml",
        ...OFFLINE_DOCUMENT_REPORT_ANSWERS.slice(5),
      ),
    );

    expect((await record()).recordingsCarrying15014).toEqual(["fe-caea-reg-informativo-accepted"]);
  });

  it("refuses when ARCA gives no answer to the batch limit call, naming it", async () => {
    wsfe.behave(
      wsfeAnswersInTurn(...INVOICING_ANSWERS, ...OFFLINE_AUTHORIZATION_CODE_ANSWERS, NO_ANSWER),
    );

    await expect(
      recordArcaResponses({
        certificatePem: credentials.certificatePem,
        privateKeyPem: credentials.privateKeyPem,
        outDir,
        wsaaEndpoint: wsaa.endpoint,
        wsfeEndpoint: wsfe.endpoint,
        cuit: FICTIONAL_CERTIFICATE_CUIT,
        pointOfSale: POINT_OF_SALE,
        offlinePointOfSale: OFFLINE_POINT_OF_SALE,
        now: () => NOW,
        timeoutMs: 200,
      }),
    ).rejects.toThrow("FECompTotXRequest");
  });
});

describe("recordingsCarrying15014", () => {
  it("names the recordings whose answer carries the code 15014, in order", () => {
    expect(
      recordingsCarrying15014([
        ["a", "<Obs><Code>15014</Code><Msg>x</Msg></Obs>"],
        ["b", "<Obs><Code>1439</Code><Msg>x</Msg></Obs>"],
        ["c", "<Err><Code>15014</Code><Msg>x</Msg></Err>"],
      ]),
    ).toEqual(["a", "c"]);
  });

  it("names none when no answer carries it, even one carrying the digits elsewhere", () => {
    expect(
      recordingsCarrying15014([
        ["a", "<Obs><Code>150145</Code><Msg>15014</Msg></Obs>"],
        ["b", ""],
      ]),
    ).toEqual([]);
  });
});

describe("recordingFailure", () => {
  const RECORDED = {
    firstLoginIssuedTicket: true,
    invoicesRecorded: true,
    offlineAuthorizationCodeRequests: {
      first: {
        kind: "granted",
        code: {
          code: "36123456789012",
          fortnight: { start: "2026-10-01", end: "2026-10-15" },
          reportDeadline: "2026-10-23",
        },
      },
      second: { kind: "already_granted" },
    },
    currentFortnightCodeGranted: true,
    offlineDocumentReports: {
      lastReportedNumber: 1,
      accepted: { kind: "accepted" },
      partlyRejected: { kind: "rejected", number: 4, rejections: [] },
    },
    recordingsCarrying15014: [],
    scrubbed: [],
  } satisfies ArcaRecordingReport;

  it("finds nothing wrong with a recording whose login issued a ticket and that requested invoices", () => {
    expect(recordingFailure(RECORDED)).toBeUndefined();
  });

  it("fails a recording whose first login issued no ticket", () => {
    expect(recordingFailure({ ...RECORDED, firstLoginIssuedTicket: false })).toBe(
      "the first login did not issue a ticket (ARCA may still hold a valid one for this certificate); login-cms-issued is not a ticket answer",
    );
  });

  it("fails a recording that requested no invoice", () => {
    expect(recordingFailure({ ...RECORDED, invoicesRecorded: false })).toBe(
      "ARCA listed no Consumidor Final for invoice class C or gave no last authorized number, so no invoice was requested",
    );
  });

  it("fails a recording that requested no offline authorization code", () => {
    expect(recordingFailure({ ...RECORDED, offlineAuthorizationCodeRequests: undefined })).toBe(
      "every fortnight whose request window is open already holds a granted offline authorization code, or ARCA did not answer whether it does, so none was requested",
    );
  });

  it.each([
    [{ kind: "already_granted" }, "that the code was already granted"],
    [{ kind: "no_answer" }, "nothing it could read"],
    [
      { kind: "refused", rejections: [{ code: 15006, message: "Fuera de plazo" }] },
      "15006: Fuera de plazo",
    ],
  ] satisfies [OfflineAuthorizationCodeRequestAnswer, string][])(
    "fails a recording whose first code request answered %j instead of granting a code",
    (first, answered) => {
      expect(
        recordingFailure({
          ...RECORDED,
          offlineAuthorizationCodeRequests: {
            ...RECORDED.offlineAuthorizationCodeRequests,
            first,
          },
        }),
      ).toBe(
        `the first FECAEASolicitar granted no offline authorization code; ARCA answered ${answered}`,
      );
    },
  );

  it.each([
    [
      { kind: "granted", code: RECORDED.offlineAuthorizationCodeRequests.first.code },
      "a granted code",
    ],
    [{ kind: "no_answer" }, "nothing it could read"],
    [
      {
        kind: "refused",
        rejections: [
          { code: 15006, message: "Fuera de plazo" },
          { code: 10, message: "Otro motivo" },
        ],
      },
      "15006: Fuera de plazo; 10: Otro motivo",
    ],
  ] satisfies [OfflineAuthorizationCodeRequestAnswer, string][])(
    "fails a recording whose second code request answered %j instead of the code being already granted",
    (second, answered) => {
      expect(
        recordingFailure({
          ...RECORDED,
          offlineAuthorizationCodeRequests: {
            ...RECORDED.offlineAuthorizationCodeRequests,
            second,
          },
        }),
      ).toBe(
        `the second FECAEASolicitar did not answer that the code was already granted; ARCA answered ${answered}`,
      );
    },
  );

  it("fails a recording whose current fortnight holds no granted offline authorization code", () => {
    expect(
      recordingFailure({
        ...RECORDED,
        currentFortnightCodeGranted: false,
        offlineDocumentReports: undefined,
      }),
    ).toBe(
      "the offline authorization code of the current fortnight is not granted, so no document was reported",
    );
  });

  it("fails a recording whose offline point of sale gave no last reported number", () => {
    expect(recordingFailure({ ...RECORDED, offlineDocumentReports: undefined })).toBe(
      "ARCA gave no last reported number on the offline point of sale, so no document was reported",
    );
  });

  it.each([
    [{ kind: "no_answer" }, "nothing it could read"],
    [
      { kind: "rejected", number: 2, rejections: [{ code: 1439, message: "Importe" }] },
      "a rejection of document 2: 1439: Importe",
    ],
    [{ kind: "refused", rejections: [{ code: 703, message: "CAEA" }] }, "703: CAEA"],
  ] satisfies [OfflineDocumentReportAnswer, string][])(
    "fails a recording whose report of one document answered %j instead of accepting it",
    (accepted, answered) => {
      expect(
        recordingFailure({
          ...RECORDED,
          offlineDocumentReports: { ...RECORDED.offlineDocumentReports, accepted },
        }),
      ).toBe(
        `the FECAEARegInformativo of one document was not accepted; ARCA answered ${answered}`,
      );
    },
  );

  it.each([
    [{ kind: "accepted" }, "its acceptance"],
    [{ kind: "no_answer" }, "nothing it could read"],
    [
      { kind: "rejected", number: 3, rejections: [{ code: 1439, message: "Importe" }] },
      "a rejection of document 3: 1439: Importe",
    ],
    [{ kind: "refused", rejections: [{ code: 703, message: "CAEA" }] }, "703: CAEA"],
  ] satisfies [OfflineDocumentReportAnswer, string][])(
    "fails a recording whose report of three documents answered %j instead of rejecting the third one's number",
    (partlyRejected, answered) => {
      expect(
        recordingFailure({
          ...RECORDED,
          offlineDocumentReports: { ...RECORDED.offlineDocumentReports, partlyRejected },
        }),
      ).toBe(
        `the FECAEARegInformativo of three documents did not reject document 4; ARCA answered ${answered}`,
      );
    },
  );

  it("names a CUIT ARCA wrote in a refusal only as the fictional one", () => {
    const failure = recordingFailure({
      ...RECORDED,
      offlineAuthorizationCodeRequests: {
        ...RECORDED.offlineAuthorizationCodeRequests,
        first: {
          kind: "refused",
          rejections: [{ code: 15006, message: `No autorizado para la CUIT ${ORIGINAL_CUIT}` }],
        },
      },
    });

    expect(failure).not.toContain(ORIGINAL_CUIT);
    expect(failure).toContain(
      `15006: No autorizado para la CUIT ${FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", "")}`,
    );
  });
});

describe("recordingSettingsOf", () => {
  const environment = { ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE, ARCA_PRIVATE_KEY: "KEY" };

  it.each([
    [["--out", "/some/dir", "--point-of-sale", "7", "--offline-point-of-sale", "8"]],
    [["--offline-point-of-sale", "8", "--point-of-sale", "7", "--out", "/some/dir"]],
  ])(
    "reads the output directory from --out, the points of sale from --point-of-sale and --offline-point-of-sale, the credentials from the environment and the CUIT from the certificate: %j",
    (argv) => {
      expect(recordingSettingsOf(argv, environment)).toEqual({
        kind: "ready",
        settings: {
          outDir: "/some/dir",
          pointOfSale: 7,
          offlinePointOfSale: 8,
          certificatePem: VALID_ARCA_CERTIFICATE,
          privateKeyPem: "KEY",
          cuit: FICTIONAL_CERTIFICATE_CUIT,
        },
      });
    },
  );

  it.each([
    [ARCA_CERTIFICATE_WITHOUT_SERIAL_NUMBER, "serialNumber"],
    [ARCA_CERTIFICATE_WITH_WRONG_CHECK_DIGIT, "check digit"],
  ])("refuses a certificate that carries no valid CUIT, saying why", (certificate, reason) => {
    const result = recordingSettingsOf(
      ["--out", "/d", "--point-of-sale", "7", "--offline-point-of-sale", "8"],
      {
        ...environment,
        ARCA_CERTIFICATE: certificate,
      },
    );

    expect(result).toEqual({ kind: "refused", reason: expect.stringContaining(reason) });
  });

  it.each([
    [[], "--out"],
    [["--out"], "--out"],
    [["--point-of-sale", "7", "--offline-point-of-sale", "8"], "--out"],
  ])("refuses %j without an output directory", (argv, mention) => {
    const result = recordingSettingsOf(argv, environment);

    expect(result.kind).toBe("refused");
    expect(JSON.stringify(result)).toContain(mention);
  });

  it.each([
    [["--out", "/d", "--offline-point-of-sale", "8"]],
    [["--out", "/d", "--point-of-sale", "--offline-point-of-sale", "8"]],
    [["--out", "/d", "--point-of-sale", "0", "--offline-point-of-sale", "8"]],
    [["--out", "/d", "--point-of-sale", "100000", "--offline-point-of-sale", "8"]],
    [["--out", "/d", "--point-of-sale", "7.5", "--offline-point-of-sale", "8"]],
    [["--out", "/d", "--point-of-sale", "seven", "--offline-point-of-sale", "8"]],
    [
      [
        "--out",
        "/d",
        "--point-of-sale",
        "7",
        "--point-of-sale",
        "9",
        "--offline-point-of-sale",
        "8",
      ],
    ],
  ])("refuses %j without a valid point of sale", (argv) => {
    const result = recordingSettingsOf(argv, environment);

    expect(result.kind).toBe("refused");
    expect(JSON.stringify(result)).toContain("--point-of-sale");
  });

  it.each([
    [["--out", "/d", "--point-of-sale", "7"]],
    [["--out", "/d", "--point-of-sale", "7", "--offline-point-of-sale"]],
    [["--out", "/d", "--point-of-sale", "7", "--offline-point-of-sale", "0"]],
    [["--out", "/d", "--point-of-sale", "7", "--offline-point-of-sale", "100000"]],
    [["--out", "/d", "--point-of-sale", "7", "--offline-point-of-sale", "8.5"]],
    [["--out", "/d", "--point-of-sale", "7", "--offline-point-of-sale", "eight"]],
    [
      [
        "--out",
        "/d",
        "--point-of-sale",
        "7",
        "--offline-point-of-sale",
        "8",
        "--offline-point-of-sale",
        "9",
      ],
    ],
  ])("refuses %j without a valid offline point of sale", (argv) => {
    const result = recordingSettingsOf(argv, environment);

    expect(result.kind).toBe("refused");
    expect(JSON.stringify(result)).toContain("--offline-point-of-sale");
  });

  it("refuses an offline point of sale equal to the online one, saying so", () => {
    const result = recordingSettingsOf(
      ["--out", "/d", "--point-of-sale", "7", "--offline-point-of-sale", "7"],
      environment,
    );

    expect(result).toEqual({
      kind: "refused",
      reason: "--offline-point-of-sale must differ from --point-of-sale",
    });
  });

  it("passes on the refusal of credentials it cannot read", () => {
    const result = recordingSettingsOf(
      ["--out", "/d", "--point-of-sale", "7", "--offline-point-of-sale", "8"],
      {
        ...environment,
        ARCA_PRIVATE_KEY: undefined,
      },
    );

    expect(result).toEqual({
      kind: "refused",
      reason: expect.stringContaining("ARCA_PRIVATE_KEY"),
    });
  });

  it("accepts no other argument, so there is nothing to point it at production with", () => {
    const result = recordingSettingsOf(
      [
        "--out",
        "/d",
        "--point-of-sale",
        "7",
        "--offline-point-of-sale",
        "8",
        "--environment",
        "production",
      ],
      environment,
    );

    expect(result.kind).toBe("refused");
  });
});

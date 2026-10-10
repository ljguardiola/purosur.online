import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FICTIONAL_CERTIFICATE_CUIT,
  FICTIONAL_CUIT,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ARCA_CERTIFICATE_WITH_WRONG_CHECK_DIGIT,
  ARCA_CERTIFICATE_WITHOUT_SERIAL_NUMBER,
  VALID_ARCA_CERTIFICATE,
} from "../test-support/arca-certificate-fixtures.js";
import {
  recordArcaResponses,
  recordingFailure,
  recordingSettingsOf,
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
const FIRST_OFFLINE_AUTHORIZATION_CODE_CALL = INVOICING_ANSWERS.length;

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

  it("makes exactly one FEDummy call, two logins, two buyer tax-status calls, one last-authorized call, three invoice calls and six offline authorization code calls", async () => {
    await record();

    expect(wsfe.requests).toHaveLength(13);
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
      "fe-caea-solicitar-already-granted.raw.xml",
      "fe-caea-solicitar-already-granted.scrubbed.xml",
      "fe-caea-solicitar-granted.raw.xml",
      "fe-caea-solicitar-granted.scrubbed.xml",
      "fe-caea-solicitar-out-of-window.raw.xml",
      "fe-caea-solicitar-out-of-window.scrubbed.xml",
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
        now: () => NOW,
        timeoutMs: 200,
      }),
    ).rejects.toThrow("FECompUltimoAutorizado");
  });
});

describe("recordArcaResponses offline authorization code calls", () => {
  const codeCalls = () => wsfe.requests.slice(FIRST_OFFLINE_AUTHORIZATION_CODE_CALL);
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
      ),
    );

    await record({ now: () => new Date("2026-10-11T03:00:00.000Z") });

    expect(codeCalls().map(operationOf)).toEqual([
      "FECAEAConsultar",
      "FECAEAConsultar",
      "FECAEASolicitar",
      "FECAEASolicitar",
      "FECAEAConsultar",
      "FECAEAConsultar",
      "FECAEASolicitar",
    ]);
    expect(periodsOf(codeCalls())).toEqual([
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
    wsfe.behave(wsfeAnswersInTurn(...INVOICING_ANSWERS, "fe-caea-consultar-granted.xml"));

    const report = await record();

    expect(codeCalls().map(operationOf)).toEqual(["FECAEAConsultar"]);
    expect(report.offlineAuthorizationCodesRecorded).toBe(false);
    expect(readdirSync(outDir).filter((file) => file.startsWith("fe-caea"))).toEqual([]);
  });

  it("saves the raw answer of each offline authorization code call", async () => {
    const report = await record();

    expect(report.offlineAuthorizationCodesRecorded).toBe(true);
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
        now: () => NOW,
        timeoutMs: 200,
      }),
    ).rejects.toThrow("FECAEAConsultar");
  });
});

describe("recordingFailure", () => {
  const RECORDED = {
    firstLoginIssuedTicket: true,
    invoicesRecorded: true,
    offlineAuthorizationCodesRecorded: true,
    scrubbed: [],
  };

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
    expect(recordingFailure({ ...RECORDED, offlineAuthorizationCodesRecorded: false })).toBe(
      "every fortnight whose request window is open already holds a granted offline authorization code, or ARCA did not answer whether it does, so none was requested",
    );
  });
});

describe("recordingSettingsOf", () => {
  const environment = { ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE, ARCA_PRIVATE_KEY: "KEY" };

  it.each([
    [["--out", "/some/dir", "--point-of-sale", "7"]],
    [["--point-of-sale", "7", "--out", "/some/dir"]],
  ])(
    "reads the output directory from --out, the point of sale from --point-of-sale, the credentials from the environment and the CUIT from the certificate: %j",
    (argv) => {
      expect(recordingSettingsOf(argv, environment)).toEqual({
        kind: "ready",
        settings: {
          outDir: "/some/dir",
          pointOfSale: 7,
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
    const result = recordingSettingsOf(["--out", "/d", "--point-of-sale", "7"], {
      ...environment,
      ARCA_CERTIFICATE: certificate,
    });

    expect(result).toEqual({ kind: "refused", reason: expect.stringContaining(reason) });
  });

  it.each([
    [[], "--out"],
    [["--out"], "--out"],
    [["--point-of-sale", "7"], "--out"],
  ])("refuses %j without an output directory", (argv, mention) => {
    const result = recordingSettingsOf(argv, environment);

    expect(result.kind).toBe("refused");
    expect(JSON.stringify(result)).toContain(mention);
  });

  it.each([
    [["--out", "/d"]],
    [["--out", "/d", "--point-of-sale"]],
    [["--out", "/d", "--point-of-sale", "0"]],
    [["--out", "/d", "--point-of-sale", "100000"]],
    [["--out", "/d", "--point-of-sale", "7.5"]],
    [["--out", "/d", "--point-of-sale", "seven"]],
    [["--out", "/d", "--point-of-sale", "7", "--point-of-sale", "8"]],
  ])("refuses %j without a valid point of sale", (argv) => {
    const result = recordingSettingsOf(argv, environment);

    expect(result.kind).toBe("refused");
    expect(JSON.stringify(result)).toContain("--point-of-sale");
  });

  it("passes on the refusal of credentials it cannot read", () => {
    const result = recordingSettingsOf(["--out", "/d", "--point-of-sale", "7"], {
      ...environment,
      ARCA_PRIVATE_KEY: undefined,
    });

    expect(result).toEqual({
      kind: "refused",
      reason: expect.stringContaining("ARCA_PRIVATE_KEY"),
    });
  });

  it("accepts no other argument, so there is nothing to point it at production with", () => {
    const result = recordingSettingsOf(
      ["--out", "/d", "--point-of-sale", "7", "--environment", "production"],
      environment,
    );

    expect(result.kind).toBe("refused");
  });
});

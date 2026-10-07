import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FICTIONAL_CERTIFICATE_CUIT,
  FICTIONAL_CUIT,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recordArcaResponses, recordingSettingsOf } from "./arca-response-recording.js";
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
  answers as wsfeAnswers,
  answersInTurn as wsfeAnswersInTurn,
} from "./test-support/fake-wsfe-server.js";

const NOW = new Date("2026-10-01T15:00:00.000Z");
const ORIGINAL_TOKEN = "T0K3N-original/with+base64==";
const ORIGINAL_SIGN = "S1GN-original/with+base64==";
const ORIGINAL_CUIT = FICTIONAL_CUIT.replaceAll("-", "");

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
    ),
  );
});

afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

function record() {
  return recordArcaResponses({
    certificatePem: credentials.certificatePem,
    privateKeyPem: credentials.privateKeyPem,
    outDir,
    wsaaEndpoint: wsaa.endpoint,
    wsfeEndpoint: wsfe.endpoint,
    cuit: FICTIONAL_CERTIFICATE_CUIT,
    now: () => NOW,
  });
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

  it("makes exactly one FEDummy call, two logins and two buyer tax-status calls", async () => {
    await record();

    expect(wsfe.requests).toHaveLength(3);
    expect(wsaa.requests).toHaveLength(2);
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
        replacements: [{ field: "CUIT", count: 1 }],
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
        now: () => NOW,
        timeoutMs: 200,
      }),
    ).rejects.toThrow("FEParamGetCondicionIvaReceptor");
  });
});

describe("recordingSettingsOf", () => {
  const environment = { ARCA_CERTIFICATE: "CERT", ARCA_PRIVATE_KEY: "KEY" };

  it("reads the output directory from --out and the credentials from the environment", () => {
    expect(recordingSettingsOf(["--out", "/some/dir"], environment)).toEqual({
      kind: "ready",
      settings: { outDir: "/some/dir", certificatePem: "CERT", privateKeyPem: "KEY" },
    });
  });

  it("turns the literal \\n of a collapsed variable into line breaks", () => {
    const result = recordingSettingsOf(["--out", "/d"], {
      ARCA_CERTIFICATE: "A\\nB",
      ARCA_PRIVATE_KEY: "C\\nD",
    });

    expect(result).toEqual({
      kind: "ready",
      settings: { outDir: "/d", certificatePem: "A\nB", privateKeyPem: "C\nD" },
    });
  });

  it.each([
    [[], "--out"],
    [["--out"], "--out"],
  ])("refuses %j without an output directory", (argv, mention) => {
    const result = recordingSettingsOf(argv, environment);

    expect(result.kind).toBe("refused");
    expect(JSON.stringify(result)).toContain(mention);
  });

  it.each(["ARCA_CERTIFICATE", "ARCA_PRIVATE_KEY"])("refuses without %s", (name) => {
    const result = recordingSettingsOf(["--out", "/d"], { ...environment, [name]: undefined });

    expect(result).toEqual({ kind: "refused", reason: expect.stringContaining(name) });
  });

  it("accepts no other argument, so there is nothing to point it at production with", () => {
    const result = recordingSettingsOf(["--out", "/d", "--environment", "production"], environment);

    expect(result.kind).toBe("refused");
  });
});

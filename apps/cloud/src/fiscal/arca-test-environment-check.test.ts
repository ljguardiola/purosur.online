import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { VALID_ARCA_CERTIFICATE } from "../test-support/arca-certificate-fixtures.js";
import {
  arcaTestEnvironmentCheckSettingsOf,
  checkArcaTestEnvironment,
  describeArcaTestEnvironmentCheck,
  runArcaTestEnvironmentCheck,
} from "./arca-test-environment-check.js";
import {
  type ArcaTestCredentials,
  generateArcaTestCredentials,
} from "./test-support/arca-test-credentials.js";
import {
  type FakeWsaaServer,
  readLoginRequest,
  startFakeWsaaServer,
  answers as wsaaAnswers,
} from "./test-support/fake-wsaa-server.js";
import {
  type FakeWsfeServer,
  startFakeWsfeServer,
  answers as wsfeAnswers,
} from "./test-support/fake-wsfe-server.js";

const NOW = new Date("2026-10-01T15:00:00.000Z");

let wsaa: FakeWsaaServer;
let wsfe: FakeWsfeServer;
let credentials: ArcaTestCredentials;

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
  wsaa.requests.length = 0;
  wsfe.requests.length = 0;
  wsaa.behave(wsaaAnswers("login-cms-issued.xml"));
  wsfe.behave(wsfeAnswers("fe-dummy-all-ok.xml"));
});

function optionsOf(timeoutMs = 5_000) {
  return {
    certificatePem: credentials.certificatePem,
    privateKeyPem: credentials.privateKeyPem,
    wsaaEndpoint: wsaa.endpoint,
    wsfeEndpoint: wsfe.endpoint,
    now: () => NOW,
    timeoutMs,
  };
}

function check(timeoutMs?: number) {
  return checkArcaTestEnvironment(optionsOf(timeoutMs));
}

describe("checkArcaTestEnvironment", () => {
  it("passes when every FEDummy server is OK and the login issues a ticket", async () => {
    const report = await check();

    expect(report).toEqual({
      passed: true,
      feDummy: { kind: "ok" },
      login: { kind: "issued" },
    });
  });

  it("passes when the login is refused because a ticket for the certificate is still valid", async () => {
    wsaa.behave(wsaaAnswers("already-authenticated-fault.xml", 500));

    const report = await check();

    expect(report).toEqual({
      passed: true,
      feDummy: { kind: "ok" },
      login: { kind: "already_authenticated" },
    });
  });

  it("fails, with the servers' answer, when a FEDummy server is not OK", async () => {
    wsfe.behave(wsfeAnswers("fe-dummy-database-down.xml"));

    const report = await check();

    expect(report.passed).toBe(false);
    expect(report.feDummy).toEqual({
      kind: "not_ok",
      answer: { kind: "answered", appServer: "OK", dbServer: "NO", authServer: "OK" },
    });
  });

  it("fails when FEDummy gives no answer", async () => {
    wsfe.behave({ kind: "never-answers" });

    const report = await check(200);

    expect(report.passed).toBe(false);
    expect(report.feDummy).toEqual({ kind: "not_ok", answer: { kind: "unreachable" } });
  });

  it("fails, with the fault the service answered, when the login fails", async () => {
    wsaa.behave(wsaaAnswers("certificate-expired-fault.xml", 500));

    const report = await check();

    expect(report.passed).toBe(false);
    expect(report.login).toEqual({
      kind: "failed",
      fault: "ns1:cms.cert.expired: Certificado expirado",
    });
  });

  it("fails with no fault when the login answer is not a SOAP fault", async () => {
    wsaa.behave(wsaaAnswers("not-soap.txt", 500));

    const report = await check();

    expect(report.passed).toBe(false);
    expect(report.login).toEqual({ kind: "failed", fault: undefined });
  });

  it("still requests a ticket when FEDummy fails, so one run names both failures", async () => {
    wsfe.behave(wsfeAnswers("fe-dummy-database-down.xml"));
    wsaa.behave(wsaaAnswers("certificate-expired-fault.xml", 500));

    const report = await check();

    expect(report.feDummy.kind).toBe("not_ok");
    expect(report.login.kind).toBe("failed");
  });

  it("makes exactly one FEDummy call and one login, for the WSFE service, signed with the given certificate", async () => {
    await check();

    expect(wsfe.requests).toHaveLength(1);
    expect(wsfe.requests[0]).toContain("FEDummy");
    expect(wsaa.requests).toHaveLength(1);
    const login = readLoginRequest(wsaa.requests[0] as string);
    expect(login.signatureValid).toBe(true);
    expect(login.embeddedCertificatePem.trim()).toBe(credentials.certificatePem.trim());
    expect(login.signedContent).toContain("<service>wsfe</service>");
  });
});

describe("describeArcaTestEnvironmentCheck", () => {
  it("names each server's answer and that a ticket was issued", () => {
    expect(
      describeArcaTestEnvironmentCheck({
        passed: true,
        feDummy: { kind: "ok" },
        login: { kind: "issued" },
      }),
    ).toEqual(["FEDummy: every server answered OK", "loginCms: issued a ticket"]);
  });

  it("says when the login was refused because a ticket is still valid", () => {
    expect(
      describeArcaTestEnvironmentCheck({
        passed: true,
        feDummy: { kind: "ok" },
        login: { kind: "already_authenticated" },
      }),
    ).toEqual([
      "FEDummy: every server answered OK",
      "loginCms: refused because a ticket for this certificate is still valid",
    ]);
  });

  it("names the servers that are not OK and the login's fault", () => {
    expect(
      describeArcaTestEnvironmentCheck({
        passed: false,
        feDummy: {
          kind: "not_ok",
          answer: { kind: "answered", appServer: "OK", dbServer: "NOT OK", authServer: "OK" },
        },
        login: { kind: "failed", fault: "ns1:cms.cert.expired: Certificado expirado" },
      }),
    ).toEqual([
      "FEDummy: AppServer OK, DbServer NOT OK, AuthServer OK",
      "loginCms: failed with ns1:cms.cert.expired: Certificado expirado",
    ]);
  });

  it("says when FEDummy gave no answer and the login failed without a fault", () => {
    expect(
      describeArcaTestEnvironmentCheck({
        passed: false,
        feDummy: { kind: "not_ok", answer: { kind: "unreachable" } },
        login: { kind: "failed", fault: undefined },
      }),
    ).toEqual([
      "FEDummy: no answer the client could read",
      "loginCms: failed with no SOAP fault the client could read",
    ]);
  });
});

describe("runArcaTestEnvironmentCheck", () => {
  it("writes the report and exits with 0 when the check passes", async () => {
    const lines: string[] = [];

    const exitCode = await runArcaTestEnvironmentCheck(optionsOf(), (line) => lines.push(line));

    expect(exitCode).toBe(0);
    expect(lines).toEqual(["FEDummy: every server answered OK", "loginCms: issued a ticket"]);
  });

  it("writes the report and exits with 1 when the check fails", async () => {
    wsaa.behave(wsaaAnswers("certificate-expired-fault.xml", 500));
    const lines: string[] = [];

    const exitCode = await runArcaTestEnvironmentCheck(optionsOf(), (line) => lines.push(line));

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      "FEDummy: every server answered OK",
      "loginCms: failed with ns1:cms.cert.expired: Certificado expirado",
    ]);
  });
});

describe("arcaTestEnvironmentCheckSettingsOf", () => {
  const environment = { ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE, ARCA_PRIVATE_KEY: "KEY" };

  it("reads the credentials from the environment", () => {
    expect(arcaTestEnvironmentCheckSettingsOf([], environment)).toEqual({
      kind: "ready",
      settings: { certificatePem: VALID_ARCA_CERTIFICATE, privateKeyPem: "KEY" },
    });
  });

  it("passes on the refusal of credentials it cannot read", () => {
    expect(
      arcaTestEnvironmentCheckSettingsOf([], { ...environment, ARCA_CERTIFICATE: undefined }),
    ).toEqual({ kind: "refused", reason: expect.stringContaining("ARCA_CERTIFICATE") });
  });

  it("accepts no argument, so there is nothing to point it at production with", () => {
    const result = arcaTestEnvironmentCheckSettingsOf(["--environment", "production"], environment);

    expect(result.kind).toBe("refused");
  });
});

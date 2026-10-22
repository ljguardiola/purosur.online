import { readFileSync } from "node:fs";
import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import type { OfflineDocumentOfFortnight } from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  answers,
  type FakeWsfeServer,
  startFakeWsfeServer,
  UNREACHABLE_WSFE_ENDPOINT,
} from "./test-support/fake-wsfe-server.js";
import { WsfeTaxAuthorityOfflineDocumentReports } from "./wsfe-tax-authority-offline-document-reports.js";

const token = {
  token: "FICTIONAL-TOKEN-0001",
  sign: "FICTIONAL-SIGN-0001",
  issuedAt: new Date("2026-10-16T02:00:00.000Z"),
  expiresAt: new Date("2026-10-16T14:00:00.000Z"),
};

function document(number: number, total = 12_345): OfflineDocumentOfFortnight {
  return {
    id: `document-${number}`,
    saleId: `sale-${number}`,
    registerId: "register-1",
    documentType: "factura_c",
    number,
    issuedOn: "2026-10-08",
    generatedAt: new Date("2026-10-08T15:30:45.000Z"),
    buyerDocumentType: 99,
    buyerDocumentNumber: 0,
    buyerTaxStatusCode: 5,
    total,
    netAmount: total,
    correction: null,
  };
}

const lastReportedCall = { token, pointOfSaleNumber: 8, documentType: "factura_c" } as const;
const reportCall = {
  ...lastReportedCall,
  code: "36123456789012",
  documents: [document(11), document(12, 500)],
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

function reportsAt(endpoint: string, timeoutMs = 5_000) {
  return new WsfeTaxAuthorityOfflineDocumentReports({
    endpoint,
    cuit: FICTIONAL_CERTIFICATE_CUIT,
    timeoutMs,
  });
}

function sentValues(request: string | undefined, element: string): string[] {
  return [
    ...(request ?? "").matchAll(
      new RegExp(`<(?:\\w+:)?${element}>([^<]*)</(?:\\w+:)?${element}>`, "g"),
    ),
  ].map(([, value]) => value ?? "");
}

function sentValue(request: string | undefined, element: string): string | undefined {
  return sentValues(request, element)[0];
}

const tokenRejection = [
  {
    code: 600,
    message: "ValidacionDeToken: No validaron las fechas del token GenTime, ExpTime, NowUTC",
  },
];

const noAnswerCases = [
  ["ARCA answers a SOAP fault", answers("fe-dummy-fault.xml", 500)],
  ["the answer is not SOAP", answers("not-soap.txt")],
  ["the answer says nothing about the operation", answers("fe-dummy-all-ok.xml")],
  ["ARCA never answers within the timeout", { kind: "never-answers" as const }],
] as const;

describe("WsfeTaxAuthorityOfflineDocumentReports.lastReported", () => {
  it("answers the number ARCA last holds for the point of sale and document type", async () => {
    server.behave(answers("fe-comp-ultimo-autorizado.xml"));

    expect(await reportsAt(server.endpoint).lastReported(lastReportedCall)).toEqual({
      kind: "read",
      number: 1,
    });
  });

  it("asks for the Factura C of the point of sale, authenticated with the token and the certificate's CUIT", async () => {
    server.behave(answers("fe-comp-ultimo-autorizado.xml"));

    await reportsAt(server.endpoint).lastReported(lastReportedCall);

    const [request] = server.requests;
    expect(request).toContain("FECompUltimoAutorizado");
    expect(sentValue(request, "Token")).toBe("FICTIONAL-TOKEN-0001");
    expect(sentValue(request, "Sign")).toBe("FICTIONAL-SIGN-0001");
    expect(sentValue(request, "Cuit")).toBe(FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", ""));
    expect(sentValue(request, "PtoVta")).toBe("8");
    expect(sentValue(request, "CbteTipo")).toBe("11");
  });

  it("answers refused with what ARCA said when it answers an error", async () => {
    server.behave(answers("fe-comp-ultimo-autorizado-token-error.xml"));

    expect(await reportsAt(server.endpoint).lastReported(lastReportedCall)).toEqual({
      kind: "refused",
      rejections: tokenRejection,
    });
  });

  it.each(noAnswerCases)("answers no answer when %s", async (_case, behavior) => {
    server.behave(behavior);

    expect(await reportsAt(server.endpoint, 200).lastReported(lastReportedCall)).toEqual({
      kind: "no_answer",
    });
  });

  it("answers no answer when ARCA cannot be reached", async () => {
    expect(await reportsAt(UNREACHABLE_WSFE_ENDPOINT).lastReported(lastReportedCall)).toEqual({
      kind: "no_answer",
    });
  });
});

describe("WsfeTaxAuthorityOfflineDocumentReports.batchLimit", () => {
  it("answers how many documents ARCA takes in one request", async () => {
    server.behave(answers("fe-comp-tot-x-request.xml"));

    expect(await reportsAt(server.endpoint).batchLimit(token)).toEqual({
      kind: "read",
      limit: 250,
    });
  });

  it("asks authenticated with the token and the certificate's CUIT", async () => {
    server.behave(answers("fe-comp-tot-x-request.xml"));

    await reportsAt(server.endpoint).batchLimit(token);

    const [request] = server.requests;
    expect(request).toContain("FECompTotXRequest");
    expect(sentValue(request, "Token")).toBe("FICTIONAL-TOKEN-0001");
    expect(sentValue(request, "Sign")).toBe("FICTIONAL-SIGN-0001");
    expect(sentValue(request, "Cuit")).toBe(FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", ""));
  });

  it("answers refused with what ARCA said when it answers an error", async () => {
    server.behave(answers("fe-comp-tot-x-request-token-error.xml"));

    expect(await reportsAt(server.endpoint).batchLimit(token)).toEqual({
      kind: "refused",
      rejections: tokenRejection,
    });
  });

  it("answers no answer when ARCA says a request takes no document", async () => {
    server.behave(answers("fe-comp-tot-x-request-zero.xml"));

    expect(await reportsAt(server.endpoint).batchLimit(token)).toEqual({ kind: "no_answer" });
  });

  it.each(noAnswerCases)("answers no answer when %s", async (_case, behavior) => {
    server.behave(behavior);

    expect(await reportsAt(server.endpoint, 200).batchLimit(token)).toEqual({
      kind: "no_answer",
    });
  });

  it("answers no answer when ARCA cannot be reached", async () => {
    expect(await reportsAt(UNREACHABLE_WSFE_ENDPOINT).batchLimit(token)).toEqual({
      kind: "no_answer",
    });
  });
});

describe("WsfeTaxAuthorityOfflineDocumentReports.report", () => {
  it("answers accepted when ARCA registers every document", async () => {
    server.behave(answers("fe-caea-reg-informativo-accepted.xml"));

    expect(await reportsAt(server.endpoint).report(reportCall)).toEqual({ kind: "accepted" });
  });

  it("lists the presentations ARCA says the business owes from every document's observations, once each", async () => {
    server.behave(answers("fe-caea-reg-informativo-owed-presentations.xml"));

    expect(await reportsAt(server.endpoint).report(reportCall)).toEqual({
      kind: "accepted",
      owedPresentations: [
        { pointOfSaleNumber: 4, fortnight: { start: "2026-09-01", end: "2026-09-15" } },
        { pointOfSaleNumber: 9, fortnight: { start: "2026-08-16", end: "2026-08-31" } },
        { pointOfSaleNumber: 4, fortnight: { start: "2026-07-01", end: "2026-07-15" } },
      ],
    });
  });

  it("answers an empty list of owed presentations when observation 15014 names none it can read", async () => {
    server.behave(answers("fe-caea-reg-informativo-accepted-with-observation.xml"));

    expect(await reportsAt(server.endpoint).report(reportCall)).toStrictEqual({
      kind: "accepted",
      owedPresentations: [],
    });
  });

  it("lists no owed presentations when no observation 15014 comes", async () => {
    server.behave(answers("fe-caea-reg-informativo-accepted.xml"));

    expect(await reportsAt(server.endpoint).report(reportCall)).toStrictEqual({
      kind: "accepted",
    });
  });

  it("reports the documents of the point of sale under the code, authenticated with the token and the certificate's CUIT", async () => {
    server.behave(answers("fe-caea-reg-informativo-accepted.xml"));

    await reportsAt(server.endpoint).report(reportCall);

    const [request] = server.requests;
    expect(request).toContain("FECAEARegInformativo");
    expect(sentValue(request, "Token")).toBe("FICTIONAL-TOKEN-0001");
    expect(sentValue(request, "Sign")).toBe("FICTIONAL-SIGN-0001");
    expect(sentValue(request, "Cuit")).toBe(FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", ""));
    expect(sentValue(request, "CantReg")).toBe("2");
    expect(sentValue(request, "PtoVta")).toBe("8");
    expect(sentValue(request, "CbteTipo")).toBe("11");
    expect(sentValues(request, "CAEA")).toEqual(["36123456789012", "36123456789012"]);
  });

  it("sends each document with its number, date, generation time, amounts and buyer", async () => {
    server.behave(answers("fe-caea-reg-informativo-accepted.xml"));

    await reportsAt(server.endpoint).report(reportCall);

    const [request] = server.requests;
    expect(sentValues(request, "CbteDesde")).toEqual(["11", "12"]);
    expect(sentValues(request, "CbteFch")).toEqual(["20261008", "20261008"]);
    expect(sentValues(request, "CbteFchHsGen")).toEqual(["20261008123045", "20261008123045"]);
    expect(sentValues(request, "ImpTotal")).toEqual(["123.45", "5.00"]);
    expect(sentValues(request, "ImpNeto")).toEqual(["123.45", "5.00"]);
    expect(sentValues(request, "DocTipo")).toEqual(["99", "99"]);
    expect(sentValues(request, "DocNro")).toEqual(["0", "0"]);
    expect(sentValues(request, "CondicionIVAReceptorId")).toEqual(["5", "5"]);
  });

  it("answers the first document ARCA rejects with its observations, since it processes no document after it", async () => {
    server.behave(answers("fe-caea-reg-informativo-partly-rejected.xml"));

    expect(
      await reportsAt(server.endpoint).report({
        ...reportCall,
        documents: [document(11), document(12), document(13)],
      }),
    ).toEqual({
      kind: "rejected",
      number: 12,
      rejections: [
        {
          code: 1439,
          message: "El importe total no coincide con la suma de los importes informados.",
        },
      ],
    });
  });

  it("answers refused with what ARCA said when it refuses the request as a whole", async () => {
    server.behave(answers("fe-caea-reg-informativo-refused.xml"));

    expect(await reportsAt(server.endpoint).report(reportCall)).toEqual({
      kind: "refused",
      rejections: [
        {
          code: 703,
          message: "El CAEA informado no corresponde al punto de venta o no se encuentra vigente.",
        },
      ],
    });
  });

  it("answers refused with what ARCA said when it answers a token error", async () => {
    server.behave(answers("fe-caea-reg-informativo-token-error.xml"));

    expect(await reportsAt(server.endpoint).report(reportCall)).toEqual({
      kind: "refused",
      rejections: tokenRejection,
    });
  });

  it.each(noAnswerCases)("answers no answer when %s", async (_case, behavior) => {
    server.behave(behavior);

    expect(await reportsAt(server.endpoint, 200).report(reportCall)).toEqual({
      kind: "no_answer",
    });
  });

  it("answers no answer when ARCA cannot be reached", async () => {
    expect(await reportsAt(UNREACHABLE_WSFE_ENDPOINT).report(reportCall)).toEqual({
      kind: "no_answer",
    });
  });
});

it("hands over the raw answer ARCA gave to each call", async () => {
  const received: string[] = [];
  const reports = new WsfeTaxAuthorityOfflineDocumentReports({
    endpoint: server.endpoint,
    cuit: FICTIONAL_CERTIFICATE_CUIT,
    onRawResponse: (raw) => received.push(raw),
  });
  const files = [
    "fe-comp-ultimo-autorizado.xml",
    "fe-comp-tot-x-request.xml",
    "fe-caea-reg-informativo-accepted.xml",
  ];
  server.behave(answers(files[0] ?? ""));
  await reports.lastReported(lastReportedCall);
  server.behave(answers(files[1] ?? ""));
  await reports.batchLimit(token);
  server.behave(answers(files[2] ?? ""));
  await reports.report(reportCall);

  const responses = new URL("./test-support/wsfe-responses/", import.meta.url);
  expect(received).toEqual(
    files.map((file) => readFileSync(new URL(file, responses), "utf8").trim()),
  );
});

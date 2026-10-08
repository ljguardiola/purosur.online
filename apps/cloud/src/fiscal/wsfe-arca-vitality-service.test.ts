import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  answers,
  type FakeWsfeServer,
  startFakeWsfeServer,
} from "./test-support/fake-wsfe-server.js";
import { WsfeArcaVitalityService, wsfeEndpointOf } from "./wsfe-arca-vitality-service.js";

let server: FakeWsfeServer;

beforeAll(async () => {
  server = await startFakeWsfeServer();
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  server.requests.length = 0;
  server.behave(answers("fe-dummy-all-ok.xml"));
});

function serviceOf(endpoint: string, timeoutMs = 5_000) {
  return new WsfeArcaVitalityService({ endpoint, timeoutMs });
}

describe("WsfeArcaVitalityService", () => {
  it("answers with the three servers' values when ARCA reports all of them OK", async () => {
    expect(await serviceOf(server.endpoint).check()).toEqual({
      kind: "answered",
      appServer: "OK",
      dbServer: "OK",
      authServer: "OK",
    });
  });

  it("calls FEDummy at the endpoint, with no authentication", async () => {
    await serviceOf(server.endpoint).check();

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]).toContain("FEDummy");
    expect(server.requests[0]).not.toContain("Auth");
  });

  it("hands over the raw answer ARCA gave, a SOAP fault included", async () => {
    const received: string[] = [];
    const service = new WsfeArcaVitalityService({
      endpoint: server.endpoint,
      onRawResponse: (raw) => received.push(raw),
    });

    await service.check();
    server.behave(answers("fe-dummy-fault.xml", 500));
    await service.check();

    const responses = new URL("./test-support/wsfe-responses/", import.meta.url);
    expect(received).toEqual([
      readFileSync(new URL("fe-dummy-all-ok.xml", responses), "utf8").trim(),
      readFileSync(new URL("fe-dummy-fault.xml", responses), "utf8").trim(),
    ]);
  });

  it("tells the cause of an answer it could not read, and nothing when ARCA answered", async () => {
    const causes: string[] = [];
    const service = new WsfeArcaVitalityService({
      endpoint: server.endpoint,
      onUnreachable: (cause) => causes.push(cause),
    });

    await service.check();
    server.behave(answers("not-soap.txt", 502));
    await service.check();

    expect(causes).toEqual(["HTTP 502: Invalid XML"]);
  });

  it("answers with the values as reported when one server is not OK", async () => {
    server.behave(answers("fe-dummy-database-down.xml"));

    expect(await serviceOf(server.endpoint).check()).toEqual({
      kind: "answered",
      appServer: "OK",
      dbServer: "NO",
      authServer: "OK",
    });
  });

  it("is unreachable, naming the HTTP status and the fault, on an HTTP 500 carrying a SOAP fault", async () => {
    server.behave(answers("fe-dummy-fault.xml", 500));

    expect(await serviceOf(server.endpoint).check()).toEqual({
      kind: "unreachable",
      cause: "HTTP 500: soap:Server: Server was unable to process request.",
    });
  });

  it("is unreachable, naming the HTTP status, on an HTTP error that is not SOAP", async () => {
    server.behave(answers("not-soap.txt", 502));

    expect(await serviceOf(server.endpoint).check()).toEqual({
      kind: "unreachable",
      cause: "HTTP 502: Invalid XML",
    });
  });

  it("is unreachable, saying it could not read it, on an answer that is not SOAP", async () => {
    server.behave(answers("not-soap.txt"));

    expect(await serviceOf(server.endpoint).check()).toEqual({
      kind: "unreachable",
      cause: "HTTP 200: Invalid XML",
    });
  });

  it("is unreachable, naming the server the answer lacks, on an answer missing one", async () => {
    server.behave(answers("fe-dummy-missing-auth-server.xml"));

    expect(await serviceOf(server.endpoint).check()).toEqual({
      kind: "unreachable",
      cause: "the answer lacked AuthServer",
    });
  });

  it("is unreachable, naming the network error, when the connection is refused", async () => {
    const closedPort = await new Promise<number>((resolve) => {
      const probe = createServer();
      probe.listen(0, "127.0.0.1", () => {
        const address = probe.address();
        const port = typeof address === "object" && address ? address.port : 0;
        probe.close(() => resolve(port));
      });
    });

    expect(await serviceOf(`http://127.0.0.1:${closedPort}/wsfev1/service.asmx`).check()).toEqual({
      kind: "unreachable",
      cause: `connect ECONNREFUSED 127.0.0.1:${closedPort}`,
    });
  });

  it("is unreachable, naming the time limit, when ARCA never answers within it", async () => {
    server.behave({ kind: "never-answers" });

    expect(await serviceOf(server.endpoint, 200).check()).toEqual({
      kind: "unreachable",
      cause: "ECONNABORTED: timeout of 200ms exceeded",
    });
  });
});

describe("wsfeEndpointOf", () => {
  it("is ARCA's homologation service for homologation and its production service for production", () => {
    expect(wsfeEndpointOf("homologation")).toBe("https://wswhomo.afip.gov.ar/wsfev1/service.asmx");
    expect(wsfeEndpointOf("production")).toBe("https://servicios1.afip.gov.ar/wsfev1/service.asmx");
  });

  it("refuses an environment it does not know", () => {
    expect(() => wsfeEndpointOf("staging")).toThrow(
      'No WSFE endpoint for the ARCA environment "staging"',
    );
  });
});

import { execFile } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { type FakeWsfeServer, startFakeWsfeServer } from "./test-support/fake-wsfe-server.js";

let server: FakeWsfeServer;

beforeAll(async () => {
  server = await startFakeWsfeServer();
});

afterAll(async () => {
  await server.close();
});

describe("the built WSFE vitality service", () => {
  it("finds the WSDL the build ships and answers from the endpoint", async () => {
    const moduleUrl = pathToFileURL(
      join(inject("cloudBuildDir"), "fiscal", "wsfe-arca-vitality-service.js"),
    ).href;
    const script = `
      const { WsfeArcaVitalityService } = await import(${JSON.stringify(moduleUrl)});
      const service = new WsfeArcaVitalityService({ endpoint: ${JSON.stringify(server.endpoint)}, timeoutMs: 5000 });
      console.log(JSON.stringify(await service.check()));
    `;

    const result = await promisify(execFile)(
      process.execPath,
      ["--input-type=module", "-e", script],
      { timeout: 30_000 },
    );

    expect(JSON.parse(result.stdout)).toEqual({
      kind: "answered",
      appServer: "OK",
      dbServer: "OK",
      authServer: "OK",
    });
  });
});

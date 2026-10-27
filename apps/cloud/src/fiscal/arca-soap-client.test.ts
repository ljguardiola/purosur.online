import { get } from "node:https";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createArcaSoapClient } from "./arca-soap-client.js";
import {
  type SmallDhGroupServer,
  startSmallDhGroupServer,
} from "./test-support/small-dh-group-server.js";

const WSFE_WSDL_PATH = fileURLToPath(new URL("../../wsdl/wsfev1.wsdl", import.meta.url));
const FE_DUMMY_ALL_OK = new URL(
  "./test-support/wsfe-responses/fe-dummy-all-ok.xml",
  import.meta.url,
);

let trustedServer: SmallDhGroupServer;
let untrustedServer: SmallDhGroupServer;
let defaultCertificates: string[];

beforeAll(async () => {
  trustedServer = await startSmallDhGroupServer(FE_DUMMY_ALL_OK);
  untrustedServer = await startSmallDhGroupServer(FE_DUMMY_ALL_OK);
  defaultCertificates = getCACertificates("default");
  setDefaultCACertificates([...defaultCertificates, trustedServer.certificate.cert]);
});

afterAll(async () => {
  setDefaultCACertificates(defaultCertificates);
  await trustedServer.close();
  await untrustedServer.close();
});

function requestWithDefaultSettings(endpoint: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    get(endpoint, (response) => {
      response.resume();
      resolve(response.statusCode);
    }).on("error", reject);
  });
}

async function feDummyThroughArcaClient(endpoint: string): Promise<unknown> {
  const client = await createArcaSoapClient(WSFE_WSDL_PATH, endpoint);
  const [result] = await client["FEDummyAsync"]({}, { timeout: 5_000 });
  return result;
}

describe("createArcaSoapClient", () => {
  it("is needed because a host offering a 1024-bit Diffie-Hellman group is refused by default", async () => {
    await expect(requestWithDefaultSettings(trustedServer.endpoint)).rejects.toThrow(
      /dh key too small/,
    );
  });

  it("reaches an ARCA host that offers a 1024-bit Diffie-Hellman group", async () => {
    expect(await feDummyThroughArcaClient(trustedServer.endpoint)).toMatchObject({
      FEDummyResult: { AppServer: "OK", DbServer: "OK", AuthServer: "OK" },
    });
  });

  it("still refuses a host whose certificate is not trusted", async () => {
    await expect(feDummyThroughArcaClient(untrustedServer.endpoint)).rejects.toMatchObject({
      code: "DEPTH_ZERO_SELF_SIGNED_CERT",
    });
  });
});

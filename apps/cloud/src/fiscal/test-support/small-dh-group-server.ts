import { createDiffieHellmanGroup } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import {
  type SelfSignedCertificate,
  selfSignedCertificateFor,
} from "../../platform/test-support/self-signed-certificate.js";

const SMALL_DH_GROUP_HOST = "localhost";

function derLength(length: number): number[] {
  return length < 0x80 ? [length] : [0x81, length];
}

function derInteger(value: Buffer): number[] {
  const content = (value[0] ?? 0) & 0x80 ? [0, ...value] : [...value];
  return [0x02, ...derLength(content.length), ...content];
}

function oneThousandTwentyFourBitDhParameters(): string {
  const group = createDiffieHellmanGroup("modp2");
  const content = [...derInteger(group.getPrime()), ...derInteger(group.getGenerator())];
  const der = Buffer.from([0x30, ...derLength(content.length), ...content]);
  return `-----BEGIN DH PARAMETERS-----\n${der.toString("base64")}\n-----END DH PARAMETERS-----\n`;
}

export interface SmallDhGroupServer {
  endpoint: string;
  certificate: SelfSignedCertificate;
  close(): Promise<void>;
}

export async function startSmallDhGroupServer(response: URL): Promise<SmallDhGroupServer> {
  const certificate = selfSignedCertificateFor(SMALL_DH_GROUP_HOST);
  const server: Server = createServer(
    {
      ...certificate,
      dhparam: oneThousandTwentyFourBitDhParameters(),
      ciphers: "DHE-RSA-AES128-GCM-SHA256@SECLEVEL=0",
      maxVersion: "TLSv1.2",
    },
    (request, reply) => {
      request.resume();
      request.on("end", () => {
        reply.writeHead(200, { "content-type": "text/xml; charset=utf-8" });
        reply.end(readFileSync(response));
      });
    },
  );
  await new Promise<void>((resolve) => server.listen(0, SMALL_DH_GROUP_HOST, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `https://${SMALL_DH_GROUP_HOST}:${port}/service`,
    certificate,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

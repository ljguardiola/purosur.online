import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import forge from "node-forge";

const RESPONSES_DIR = new URL("./wsaa-responses/", import.meta.url);

export interface FakeWsaaAnswer {
  status: number;
  body: string;
}

export type FakeWsaaBehavior =
  | ({ kind: "answers" } & FakeWsaaAnswer)
  | { kind: "answers-in-turn"; steps: FakeWsaaAnswer[] }
  | ({ kind: "answers-when-released" } & FakeWsaaAnswer)
  | { kind: "never-answers" };

export interface FakeWsaaServer {
  endpoint: string;
  requests: string[];
  behave(behavior: FakeWsaaBehavior): void;
  nextRequest(): Promise<void>;
  /** Sends the held answer to every request the server is holding. */
  release(): void;
  close(): Promise<void>;
}

function recorded(responseFile: string): string {
  return readFileSync(new URL(responseFile, RESPONSES_DIR), "utf8");
}

export function answers(responseFile: string, status = 200): FakeWsaaBehavior {
  return { kind: "answers", status, body: recorded(responseFile) };
}

export function answerOf(body: string, status = 200): FakeWsaaAnswer {
  return { status, body };
}

/** Answers each request with the next step, and the last step to every request after them. */
export function answersInTurn(...steps: FakeWsaaAnswer[]): FakeWsaaBehavior {
  return { kind: "answers-in-turn", steps };
}

export function recordedAnswer(responseFile: string, status = 200): FakeWsaaAnswer {
  return { status, body: recorded(responseFile) };
}

export function answersWhenReleased(responseFile: string, status = 200): FakeWsaaBehavior {
  return { kind: "answers-when-released", status, body: recorded(responseFile) };
}

export async function startFakeWsaaServer(
  initial: FakeWsaaBehavior = answers("login-cms-issued.xml"),
): Promise<FakeWsaaServer> {
  let behavior = initial;
  const requests: string[] = [];
  const held: (() => void)[] = [];
  const requestWaiters: (() => void)[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      requests.push(Buffer.concat(chunks).toString("utf8"));
      for (const waiter of requestWaiters.splice(0)) {
        waiter();
      }
      if (behavior.kind === "never-answers") {
        return;
      }
      const answer =
        behavior.kind === "answers-in-turn"
          ? (behavior.steps[Math.min(requests.length, behavior.steps.length) - 1] as FakeWsaaAnswer)
          : behavior;
      const send = () => {
        response.writeHead(answer.status, { "content-type": "text/xml; charset=utf-8" });
        response.end(answer.body);
      };
      if (behavior.kind === "answers-when-released") {
        held.push(send);
      } else {
        send();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `http://127.0.0.1:${port}/ws/services/LoginCms`,
    requests,
    behave(next) {
      behavior = next;
    },
    nextRequest: () => new Promise<void>((resolve) => requestWaiters.push(resolve)),
    release() {
      for (const send of held.splice(0)) {
        send();
      }
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

export interface ReceivedLoginRequest {
  /** The login ticket request the CMS carries, as text. */
  signedContent: string;
  /** Whether the signer's signature over the content verifies against the embedded certificate. */
  signatureValid: boolean;
  embeddedCertificatePem: string;
  digestAlgorithmOid: string;
  /** Whether the signed attributes' message digest is the SHA-256 of the content. */
  contentDigestMatches: boolean;
}

export const SHA256_OID = "2.16.840.1.101.3.4.2.1";
const MESSAGE_DIGEST_OID = "1.2.840.113549.1.9.4";

/** Reads the `in0` CMS of a loginCms request and checks its signature the way WSAA does. */
export function readLoginRequest(soapRequest: string): ReceivedLoginRequest {
  const base64 = /<(?:\w+:)?in0>([^<]*)<\/(?:\w+:)?in0>/.exec(soapRequest)?.[1];
  if (!base64) {
    throw new Error("the request carries no CMS in in0");
  }
  const message = forge.pkcs7.messageFromAsn1(
    forge.asn1.fromDer(forge.util.decode64(base64)),
  ) as forge.pkcs7.PkcsSignedData & {
    rawCapture: {
      authenticatedAttributes: forge.asn1.Asn1[];
      signature: string;
      digestAlgorithm: string;
      content: forge.asn1.Asn1;
    };
  };
  const certificate = message.certificates[0];
  if (!certificate) {
    throw new Error("the CMS embeds no certificate");
  }
  const signedContent = (message.rawCapture.content.value as forge.asn1.Asn1[])[0]?.value as string;
  const attributes = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SET,
    true,
    message.rawCapture.authenticatedAttributes,
  );
  const certificatePem = forge.pki.certificateToPem(certificate);
  const signatureValid = verify(
    "sha256",
    Buffer.from(forge.asn1.toDer(attributes).getBytes(), "binary"),
    createPublicKey(forge.pki.publicKeyToPem(certificate.publicKey as forge.pki.rsa.PublicKey)),
    Buffer.from(message.rawCapture.signature, "binary"),
  );
  const messageDigest = message.rawCapture.authenticatedAttributes
    .map((attribute) => attribute.value as forge.asn1.Asn1[])
    .find((parts) => forge.asn1.derToOid(parts[0]?.value as string) === MESSAGE_DIGEST_OID);
  const signedDigest = ((messageDigest?.[1]?.value as forge.asn1.Asn1[] | undefined)?.[0]?.value ??
    "") as string;
  const contentDigest = createHash("sha256").update(Buffer.from(signedContent, "binary")).digest();
  return {
    contentDigestMatches: Buffer.from(signedDigest, "binary").equals(contentDigest),
    signedContent: Buffer.from(signedContent, "binary").toString("utf8"),
    signatureValid,
    embeddedCertificatePem: certificatePem,
    digestAlgorithmOid: forge.asn1.derToOid(message.rawCapture.digestAlgorithm),
  };
}

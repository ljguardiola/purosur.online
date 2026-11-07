import { gzipSync } from "node:zlib";
import type { FastifyReply, FastifyRequest } from "fastify";

function acceptsGzip(acceptEncoding: string | undefined): boolean {
  const quality = new Map<string, number>();
  for (const entry of (acceptEncoding ?? "").toLowerCase().split(",")) {
    const [coding = "", ...parameters] = entry.split(";").map((part) => part.trim());
    const qParameter = parameters.find((parameter) => parameter.startsWith("q="));
    quality.set(coding, qParameter === undefined ? 1 : Number(qParameter.slice(2)));
  }
  return (quality.get("gzip") ?? quality.get("*") ?? 0) > 0;
}

export async function sendGzippedJson(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  body: unknown,
): Promise<void> {
  const json = JSON.stringify(body);
  reply.header("Vary", "Accept-Encoding").type("application/json; charset=utf-8").code(statusCode);
  if (acceptsGzip(request.headers["accept-encoding"])) {
    await reply.header("Content-Encoding", "gzip").send(gzipSync(json));
    return;
  }
  await reply.send(json);
}

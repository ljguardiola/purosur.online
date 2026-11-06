import { gunzipSync } from "node:zlib";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { sendGzippedJson } from "./gzip-reply.js";

const BODY = { rows: "AAAA".repeat(500), labels: [1, 2, 3] };

let app: FastifyInstance;

function appAnswering(statusCode = 200): FastifyInstance {
  app = Fastify();
  app.get("/answer", async (request, reply) => {
    await sendGzippedJson(request, reply, statusCode, BODY);
  });
  return app;
}

function ask(acceptEncoding?: string) {
  return appAnswering().inject({
    method: "GET",
    url: "/answer",
    headers: acceptEncoding === undefined ? {} : { "accept-encoding": acceptEncoding },
  });
}

afterEach(async () => {
  await app.close();
});

describe("sendGzippedJson", () => {
  it.each(["gzip", "gzip, deflate, br", "deflate, gzip;q=0.5", "GZIP", "*"])(
    "gzips the JSON body for a request that accepts %s",
    async (acceptEncoding) => {
      const response = await ask(acceptEncoding);

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-encoding"]).toBe("gzip");
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.headers.vary).toBe("Accept-Encoding");
      expect(JSON.parse(gunzipSync(response.rawPayload).toString("utf8"))).toEqual(BODY);
      expect(response.rawPayload.length).toBeLessThan(JSON.stringify(BODY).length);
    },
  );

  it.each([undefined, "identity", "deflate, br", "gzip;q=0", "gzip; q=0.0, *;q=0.5"])(
    "sends the JSON body as is for a request that accepts %s",
    async (acceptEncoding) => {
      const response = await ask(acceptEncoding);

      expect(response.headers["content-encoding"]).toBeUndefined();
      expect(response.headers.vary).toBe("Accept-Encoding");
      expect(response.json()).toEqual(BODY);
    },
  );

  it("answers with the status it is given", async () => {
    const response = await appAnswering(201).inject({
      method: "GET",
      url: "/answer",
      headers: { "accept-encoding": "gzip" },
    });

    expect(response.statusCode).toBe(201);
  });
});

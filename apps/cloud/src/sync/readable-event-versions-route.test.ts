import { READABLE_EVENT_VERSIONS, readableEventVersionsSchema } from "@purosur/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerReadableEventVersionsRoute } from "./readable-event-versions-route.js";

const TOKEN = "release-check-token-for-tests";

let app: FastifyInstance;

beforeEach(() => {
  app = Fastify();
  registerReadableEventVersionsRoute(app, { releaseCheckToken: TOKEN });
});

afterEach(async () => {
  await app.close();
});

function ask(authorization: string | null) {
  return app.inject({
    method: "GET",
    url: "/sync/readable-event-versions",
    headers: authorization === null ? {} : { authorization },
  });
}

describe("GET /sync/readable-event-versions", () => {
  it("answers 401 without an authorization header", async () => {
    const response = await ask(null);

    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain("sale_completed");
  });

  it("lists the event versions the cloud reads", async () => {
    const response = await ask(`Bearer ${TOKEN}`);

    expect(response.statusCode).toBe(200);
    expect(readableEventVersionsSchema.parse(response.json())).toEqual({
      event_versions: [...READABLE_EVENT_VERSIONS],
    });
    expect(response.json().event_versions).toContain("sale_completed@1");
  });
});

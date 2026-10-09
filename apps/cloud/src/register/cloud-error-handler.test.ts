import { cloudErrorSchema } from "@purosur/contracts";
import { DrizzleQueryError } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerErrorsWithCloudEnvelope } from "./cloud-error-handler.js";

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify();
  await app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);
    scope.post("/contract/failing", async () => {
      throw new Error("database connection lost");
    });
    scope.post("/contract/echo", async (request) => request.body);
  });
  app.post("/outside", async () => {
    throw new Error("outside the contract");
  });
});

afterEach(async () => {
  await app.close();
  vi.restoreAllMocks();
});

describe("answerErrorsWithCloudEnvelope", () => {
  it("answers an unexpected failure as internal_error, without its cause", async () => {
    const response = await app.inject({ method: "POST", url: "/contract/failing" });

    expect(response.statusCode).toBe(500);
    expect(cloudErrorSchema.parse(response.json())).toEqual({
      code: "internal_error",
      message: "the request could not be completed",
      details: [],
    });
    expect(response.body).not.toContain("database connection lost");
  });

  it("answers a body that is not valid JSON as validation_failed", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/contract/echo",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "validation_failed",
      details: [],
    });
  });

  it("answers a body of a type the contract doesn't read as validation_failed", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/contract/echo",
      headers: { "content-type": "application/xml" },
      payload: "<code/>",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("writes an unexpected failure to the cloud's output by its route, never by the values of a failed query", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await app.close();
    app = Fastify();
    await app.register(async (scope) => {
      answerErrorsWithCloudEnvelope(scope);
      scope.post("/contract/devices/:id", async () => {
        throw new DrizzleQueryError(
          "update devices set name = $1",
          ["s3cret-value"],
          new Error("connection lost"),
        );
      });
    });

    await app.inject({
      method: "POST",
      url: "/contract/devices/42",
      headers: { authorization: "Bearer device-token" },
      payload: { name: "s3cret-value" },
    });

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "register-to-cloud request failed: POST /contract/devices/:id: unknown error: Failed query: update devices set name = $1 (caused by unknown error: connection lost)",
    );
  });

  it("writes nothing to the cloud's output for a body it refuses", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await app.inject({
      method: "POST",
      url: "/contract/echo",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });

    expect(consoleError).not.toHaveBeenCalled();
  });

  it("leaves routes outside the contract to Fastify's own answer", async () => {
    const response = await app.inject({ method: "POST", url: "/outside" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).not.toHaveProperty("details");
  });
});

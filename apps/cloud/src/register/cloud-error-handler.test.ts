import { cloudErrorSchema } from "@purosur/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

  it("logs an unexpected failure it answers for", async () => {
    const lines: string[] = [];
    const logged = Fastify({ logger: { stream: { write: (line: string) => lines.push(line) } } });
    await logged.register(async (scope) => {
      answerErrorsWithCloudEnvelope(scope);
      scope.post("/contract/failing", async () => {
        throw new Error("database connection lost");
      });
    });

    await logged.inject({ method: "POST", url: "/contract/failing" });
    await logged.close();

    expect(lines.join("")).toContain("database connection lost");
  });

  it("leaves routes outside the contract to Fastify's own answer", async () => {
    const response = await app.inject({ method: "POST", url: "/outside" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).not.toHaveProperty("details");
  });
});

import { registerCreationBodySchema } from "@purosur/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { readValidatedBody } from "./request-body-schema.js";

function buildApp(): FastifyInstance {
  const app = Fastify();
  app.post("/", async (request, reply) => {
    const body = await readValidatedBody(reply, registerCreationBodySchema, request.body);
    if (!body) {
      return;
    }
    await reply.code(200).send({ received: body });
  });
  return app;
}

describe("readValidatedBody", () => {
  it("returns the schema's parsed value for a body that matches it", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: { name: "  Caja 1  " },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: { name: "Caja 1" } });
  });

  it("replies 400 with the first failing field and sends nothing else, for a body that doesn't match", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "POST", url: "/", payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
  });

  it.each([
    ["a missing body", undefined],
    ["a null body", "null"],
    ["a string body", '"caja"'],
    ["a number body", "42"],
    ["an array body", '["caja"]'],
  ])("reports the first field for %s", async (_label, raw) => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/",
      headers: raw === undefined ? {} : { "content-type": "application/json" },
      ...(raw === undefined ? {} : { payload: raw }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
  });
});

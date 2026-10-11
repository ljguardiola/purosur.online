import { cloudErrorSchema } from "@purosur/contracts";
import { FICTIONAL_CUIT, FICTIONAL_LEGAL_NAME } from "@purosur/domain/fiscal/test-support";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { locations, suppliers, users } from "../platform/db/schema.js";
import { buildTestDatabase } from "../test-support/build-test-database.js";
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

  it("writes an unexpected failure to the cloud's output with its method, its route and the error's description", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await app.close();
    app = Fastify();
    await app.register(async (scope) => {
      answerErrorsWithCloudEnvelope(scope);
      scope.post("/contract/devices/:id", async () => {
        throw new Error("connection lost");
      });
    });

    await app.inject({ method: "POST", url: "/contract/devices/42" });

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "register-to-cloud request failed: POST /contract/devices/:id: unknown error: connection lost",
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

  it("writes a failed query to the cloud's output by its code and statement, without the values the request carried", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, close } = await buildTestDatabase();
    onTestFinished(close);
    const [location] = await db.select({ id: locations.id }).from(locations);
    const [actor] = await db
      .insert(users)
      .values({ firstName: "Ada", email: "ada@example.com", locationId: location?.id ?? "" })
      .returning({ id: users.id });
    const actorId = actor?.id ?? "";
    await db
      .insert(suppliers)
      .values({ name: FICTIONAL_LEGAL_NAME, cuit: FICTIONAL_CUIT, actorId });
    await app.close();
    app = Fastify();
    await app.register(async (scope) => {
      answerErrorsWithCloudEnvelope(scope);
      scope.post("/contract/suppliers/:id", async (request) => {
        const { id } = request.params as { id: string };
        return db.select().from(suppliers).where(eq(suppliers.id, id));
      });
      scope.post("/contract/suppliers", async () =>
        db.insert(suppliers).values({ name: FICTIONAL_LEGAL_NAME, cuit: FICTIONAL_CUIT, actorId }),
      );
    });

    await app.inject({ method: "POST", url: `/contract/suppliers/${FICTIONAL_CUIT}` });
    await app.inject({ method: "POST", url: "/contract/suppliers" });

    const lines = consoleError.mock.calls.map(([line]) => String(line));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("22P02");
    expect(lines[1]).toContain("23505");
    for (const line of lines) {
      expect(line).toContain("$1");
      expect(line).not.toContain(FICTIONAL_CUIT);
      expect(line).not.toContain(FICTIONAL_LEGAL_NAME);
    }
  });
});

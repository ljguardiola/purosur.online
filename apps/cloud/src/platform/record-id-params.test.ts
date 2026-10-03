import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { readOptionalRecordIds, readRecordIds } from "./record-id-params.js";

const ID = "3f2b8c1e-5d4a-4b7e-9c10-a1b2c3d4e5f6";

function buildApp(): FastifyInstance {
  const app = Fastify();
  app.get("/things/:id/parts/:partId", async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id", "partId"]);
    if (!ids) {
      return;
    }
    await reply.code(200).send(ids);
  });
  app.get("/filter", async (request, reply) => {
    const ids = await readOptionalRecordIds(reply, request.query, ["categoryId"]);
    if (!ids) {
      return;
    }
    await reply.code(200).send({ categoryId: ids.categoryId ?? null });
  });
  return app;
}

describe("readRecordIds", () => {
  it("returns every named id lower-cased", async () => {
    const response = await buildApp().inject({
      url: `/things/${ID.toUpperCase()}/parts/${ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: ID, partId: ID });
  });

  it.each([
    ["id", "not-a-record-id", ID],
    ["partId", ID, "not-a-record-id"],
  ])("answers 400 validation_failed naming %s when it is malformed", async (field, id, partId) => {
    const response = await buildApp().inject({ url: `/things/${id}/parts/${partId}` });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "validation_failed",
      message: `${field} must be a record id`,
      details: [{ field }],
    });
  });

  it("names the first malformed id when several are", async () => {
    const response = await buildApp().inject({ url: "/things/x/parts/y" });

    expect(response.json()).toMatchObject({ details: [{ field: "id" }] });
  });
});

describe("readOptionalRecordIds", () => {
  it("returns the id lower-cased when it is present", async () => {
    const response = await buildApp().inject({ url: `/filter?categoryId=${ID.toUpperCase()}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ categoryId: ID });
  });

  it("returns no id when it is absent", async () => {
    const response = await buildApp().inject({ url: "/filter" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ categoryId: null });
  });

  it.each(["not-a-record-id", ""])("answers 400 validation_failed for %j", async (value) => {
    const response = await buildApp().inject({ url: `/filter?categoryId=${value}` });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "validation_failed",
      message: "categoryId must be a record id",
      details: [{ field: "categoryId" }],
    });
  });
});

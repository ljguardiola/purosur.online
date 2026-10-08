import { describe, expect, it } from "vitest";
import { buildTestApp } from "./build-test-app.js";

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("buildTestApp", () => {
  it("sends the edge secret on a chained request", async () => {
    const app = buildTestApp({ now: () => NOW, version: "abc1234" });

    const response = await app.inject().get("/some-route");

    expect(response.statusCode).toBe(404);
  });

  it("keeps the edge secret on a chained request that sets its own headers", async () => {
    const app = buildTestApp({ now: () => NOW, version: "abc1234" });

    const response = await app.inject().get("/some-route").headers({ accept: "application/json" });

    expect(response.statusCode).toBe(404);
  });
});

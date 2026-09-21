import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";

describe("GET /health", () => {
  it("responds 200 with status ok and the given version", async () => {
    const app = buildApp({ version: "abc1234" });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", version: "abc1234" });
  });
});

describe("Sentry error handler wiring", () => {
  it("wires the provided setupFastifyErrorHandler function onto the built app", () => {
    const setupFastifyErrorHandler = vi.fn();

    const app = buildApp({ version: "abc1234", setupFastifyErrorHandler });

    expect(setupFastifyErrorHandler).toHaveBeenCalledTimes(1);
    expect(setupFastifyErrorHandler).toHaveBeenCalledWith(app);
  });

  it("lets an unhandled route error reach the wired error handler", async () => {
    const captured: unknown[] = [];
    const setupFastifyErrorHandler = vi.fn((fastifyApp: ReturnType<typeof buildApp>) => {
      fastifyApp.setErrorHandler((error, _request, reply) => {
        captured.push(error);
        reply.code(500).send({ status: "error" });
      });
    });

    const app = buildApp({ version: "abc1234", setupFastifyErrorHandler });
    app.get("/boom", async () => {
      throw new Error("boom");
    });

    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.statusCode).toBe(500);
    expect(captured).toHaveLength(1);
    expect((captured[0] as Error).message).toBe("boom");
  });
});

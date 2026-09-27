import { describe, expect, it } from "vitest";
import { resolveSampleDataTarget } from "./target-guard.js";

describe("resolveSampleDataTarget", () => {
  it('resolves staging when RAILWAY_ENVIRONMENT_NAME is exactly "staging"', () => {
    expect(
      resolveSampleDataTarget({
        databaseUrl: "postgres://user:pass@db.internal:5432/railway",
        railwayEnvironmentName: "staging",
      }),
    ).toBe("staging");
  });

  it("resolves staging even when DATABASE_URL is malformed", () => {
    expect(
      resolveSampleDataTarget({ databaseUrl: "not a url", railwayEnvironmentName: "staging" }),
    ).toBe("staging");
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "resolves local when RAILWAY_ENVIRONMENT_NAME is unset and the host is loopback (%s)",
    (host) => {
      expect(
        resolveSampleDataTarget({
          databaseUrl: `postgres://user:pass@${host}:5432/purosur`,
          railwayEnvironmentName: undefined,
        }),
      ).toBe("local");
    },
  );

  it("refuses production", () => {
    expect(
      resolveSampleDataTarget({
        databaseUrl: "postgres://user:pass@localhost:5432/purosur",
        railwayEnvironmentName: "production",
      }),
    ).toBe("refused");
  });

  it("refuses an unknown environment name", () => {
    expect(
      resolveSampleDataTarget({
        databaseUrl: "postgres://user:pass@localhost:5432/purosur",
        railwayEnvironmentName: "preview-123",
      }),
    ).toBe("refused");
  });

  it("refuses an empty RAILWAY_ENVIRONMENT_NAME instead of treating it as unset", () => {
    expect(
      resolveSampleDataTarget({
        databaseUrl: "postgres://user:pass@localhost:5432/purosur",
        railwayEnvironmentName: "",
      }),
    ).toBe("refused");
  });

  it("refuses a non-loopback host when RAILWAY_ENVIRONMENT_NAME is unset", () => {
    expect(
      resolveSampleDataTarget({
        databaseUrl: "postgres://user:pass@db.example.com:5432/purosur",
        railwayEnvironmentName: undefined,
      }),
    ).toBe("refused");
  });

  it("refuses a malformed DATABASE_URL when RAILWAY_ENVIRONMENT_NAME is unset", () => {
    expect(
      resolveSampleDataTarget({ databaseUrl: "not a url", railwayEnvironmentName: undefined }),
    ).toBe("refused");
  });

  it("refuses an empty DATABASE_URL", () => {
    expect(resolveSampleDataTarget({ databaseUrl: "", railwayEnvironmentName: undefined })).toBe(
      "refused",
    );
  });

  it("refuses when DATABASE_URL is unset", () => {
    expect(
      resolveSampleDataTarget({ databaseUrl: undefined, railwayEnvironmentName: undefined }),
    ).toBe("refused");
  });
});

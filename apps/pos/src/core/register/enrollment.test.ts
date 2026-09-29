import { describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import { type EnrollmentDeps, enroll, generatePepper, installationReportFrom } from "./enrollment";

const TYPED_CODE = "p4nx 7kwe 2qrt 6mzd";
const ENROLLED_BODY = { device_id: "a4b1", device_token: "prefix.secret" };

function envelope(code: string, details: unknown[] = []): CloudResponse {
  return { kind: "error", error: { code, message: "x", details } } as CloudResponse;
}

function depsAnswering(response: CloudResponse, stored = true) {
  const posted: { path: string; body: unknown }[] = [];
  const storedCredentials: unknown[] = [];
  let peppers = 0;
  const deps: EnrollmentDeps = {
    postToCloud: async (path, body) => {
      posted.push({ path, body });
      return response;
    },
    installationReport: () => ({
      hostname: "CAJA-MOSTRADOR",
      windowsVersion: "Windows 10 Pro 10.0.26100",
    }),
    generatePepper: () => `pepper-${++peppers}`,
    storeCredentials: async (credentials) => {
      storedCredentials.push(credentials);
      return stored;
    },
  };
  return { deps, posted, storedCredentials };
}

describe("enroll", () => {
  it("redeems the code, reporting the machine's hostname and Windows version", async () => {
    const { deps, posted } = depsAnswering({ kind: "ok", body: ENROLLED_BODY });

    await enroll(deps, TYPED_CODE);

    expect(posted).toEqual([
      {
        path: "/devices/enroll",
        body: {
          code: "P4NX7KWE2QRT6MZD",
          hostname: "CAJA-MOSTRADOR",
          windows_version: "Windows 10 Pro 10.0.26100",
        },
      },
    ]);
  });

  it("stores the device id and token it receives with a pepper of its own, and is enrolled", async () => {
    const { deps, storedCredentials } = depsAnswering({ kind: "ok", body: ENROLLED_BODY });

    const outcome = await enroll(deps, TYPED_CODE);

    expect(outcome).toEqual({ kind: "enrolled" });
    expect(storedCredentials).toEqual([{ ...ENROLLED_BODY, pepper: "pepper-1" }]);
  });

  it("says the enrollment wasn't kept when the credentials can't be stored", async () => {
    const { deps } = depsAnswering({ kind: "ok", body: ENROLLED_BODY }, false);

    expect(await enroll(deps, TYPED_CODE)).toEqual({ kind: "not_stored" });
  });

  it("reads an answer that isn't an enrollment as the cloud being unavailable, storing nothing", async () => {
    const { deps, storedCredentials } = depsAnswering({ kind: "ok", body: { device_id: "a4b1" } });

    expect(await enroll(deps, TYPED_CODE)).toEqual({ kind: "unavailable" });
    expect(storedCredentials).toEqual([]);
  });

  it.each([
    ["enrollment_code_rejected", [], { kind: "code_rejected" }],
    ["validation_failed", [{ field: "code" }], { kind: "code_rejected" }],
    ["validation_failed", [{ field: "hostname" }], { kind: "unavailable" }],
    [
      "rate_limited",
      [{ retry_after_seconds: 600 }],
      { kind: "rate_limited", retry_after_seconds: 600 },
    ],
    ["rate_limited", [], { kind: "rate_limited", retry_after_seconds: 0 }],
    ["server_unavailable", [], { kind: "unavailable" }],
    ["internal_error", [], { kind: "unavailable" }],
  ])("answers the cloud's %s %j as %j, storing nothing", async (code, details, expected) => {
    const { deps, storedCredentials } = depsAnswering(envelope(code, details));

    expect(await enroll(deps, TYPED_CODE)).toEqual(expected);
    expect(storedCredentials).toEqual([]);
  });

  it("says the cloud can't be reached when it can't", async () => {
    const { deps } = depsAnswering({ kind: "unreachable" });

    expect(await enroll(deps, TYPED_CODE)).toEqual({ kind: "unreachable" });
  });

  it("refuses a code that can't be one without asking the cloud", async () => {
    const { deps, posted } = depsAnswering({ kind: "ok", body: ENROLLED_BODY });

    expect(await enroll(deps, "P4NX 7KWE")).toEqual({ kind: "code_rejected" });
    expect(posted).toEqual([]);
  });

  it("answers unavailable without asking when the machine reports nothing to send", async () => {
    const { deps, posted } = depsAnswering({ kind: "ok", body: ENROLLED_BODY });
    deps.installationReport = () => ({ hostname: "", windowsVersion: "Windows 11" });

    expect(await enroll(deps, TYPED_CODE)).toEqual({ kind: "unavailable" });
    expect(posted).toEqual([]);
  });

  it("answers unavailable without asking when the register has no cloud to ask", async () => {
    const { deps } = depsAnswering({ kind: "ok", body: ENROLLED_BODY });

    expect(await enroll({ ...deps, postToCloud: undefined }, TYPED_CODE)).toEqual({
      kind: "unavailable",
    });
  });
});

describe("generatePepper", () => {
  it("generates 256 random bits, different every time", () => {
    const first = generatePepper();

    expect(Buffer.from(first, "base64url")).toHaveLength(32);
    expect(generatePepper()).not.toBe(first);
  });
});

describe("installationReportFrom", () => {
  it("reports the hostname and the Windows edition with its build number", () => {
    expect(
      installationReportFrom({
        hostname: () => "CAJA-MOSTRADOR",
        version: () => "Windows 10 Pro",
        release: () => "10.0.26100",
      }),
    ).toEqual({ hostname: "CAJA-MOSTRADOR", windowsVersion: "Windows 10 Pro 10.0.26100" });
  });
});

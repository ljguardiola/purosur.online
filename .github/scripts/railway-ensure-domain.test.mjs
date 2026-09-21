import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findServiceDomain,
  parseDomainCreateOutput,
  parseDomainListOutput,
} from "./railway-ensure-domain.mjs";

// The shape of `railway domain list --service cloud --json`: a bare hostname, no scheme.
const DOMAIN_LIST_FIXTURE = {
  domains: [
    {
      id: "8a2b6b4a-1c2d-4e5f-9a0b-1c2d3e4f5a6b",
      domain: "cloud-staging-6fea.up.railway.app",
      type: "service",
      targetPort: null,
      syncStatus: "ACTIVE",
    },
  ],
};

// findServiceDomain -----------------------------------------------------------

test("findServiceDomain reads the domain off the entry whose type is service", () => {
  assert.equal(findServiceDomain(DOMAIN_LIST_FIXTURE), "cloud-staging-6fea.up.railway.app");
});

test("findServiceDomain ignores a custom domain entry", () => {
  const value = { domains: [{ domain: "api.example.com", type: "custom" }] };

  assert.equal(findServiceDomain(value), null);
});

test("findServiceDomain picks the service domain out of a list that also has a custom one", () => {
  const value = {
    domains: [
      { domain: "api.example.com", type: "custom" },
      { domain: "cloud-staging-6fea.up.railway.app", type: "service" },
    ],
  };

  assert.equal(findServiceDomain(value), "cloud-staging-6fea.up.railway.app");
});

test("findServiceDomain returns null for an empty domains list", () => {
  assert.equal(findServiceDomain({ domains: [] }), null);
});

test("findServiceDomain returns null when domains is missing or not an array", () => {
  assert.equal(findServiceDomain({}), null);
  assert.equal(findServiceDomain(null), null);
  assert.equal(findServiceDomain({ domains: "not-an-array" }), null);
});

// parseDomainListOutput --------------------------------------------------------

test("parseDomainListOutput reports the real CLI error when the service does not exist yet", () => {
  // `railway domain list` exits 1 with this text on stderr and nothing on stdout.
  const result = parseDomainListOutput({
    exitOk: false,
    stdout: "",
    stderr: "Project has no services.\n",
  });

  assert.deepEqual(result, { ok: false, error: "Project has no services." });
});

test("parseDomainListOutput finds an existing service domain from the real shape", () => {
  const result = parseDomainListOutput({
    exitOk: true,
    stdout: JSON.stringify(DOMAIN_LIST_FIXTURE),
  });

  assert.deepEqual(result, { ok: true, domain: "cloud-staging-6fea.up.railway.app" });
});

test("parseDomainListOutput succeeds with a null domain when the service has none yet", () => {
  const result = parseDomainListOutput({ exitOk: true, stdout: JSON.stringify({ domains: [] }) });

  assert.deepEqual(result, { ok: true, domain: null });
});

test("parseDomainListOutput fails when the exit was ok but the output is not JSON", () => {
  const result = parseDomainListOutput({ exitOk: true, stdout: "not json" });

  assert.equal(result.ok, false);
  assert.match(result.error, /not json/);
});

// parseDomainCreateOutput -----------------------------------------------------

test("parseDomainCreateOutput succeeds when the call itself succeeded, without reading a domain from it", () => {
  const result = parseDomainCreateOutput({
    exitOk: true,
    stdout: JSON.stringify({ domain: "https://cloud-staging-6fea.up.railway.app" }),
  });

  assert.deepEqual(result, { ok: true });
});

test("parseDomainCreateOutput fails when the create call itself failed", () => {
  const result = parseDomainCreateOutput({ exitOk: false, stdout: "", stderr: "unauthorized" });

  assert.deepEqual(result, { ok: false, error: "unauthorized" });
});

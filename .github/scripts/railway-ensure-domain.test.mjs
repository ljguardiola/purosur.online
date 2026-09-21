import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findGeneratedDomain,
  parseDomainCreateOutput,
  parseDomainListOutput,
} from "./railway-ensure-domain.mjs";

// findGeneratedDomain -------------------------------------------------------

test("findGeneratedDomain finds a *.up.railway.app string nested anywhere in the value", () => {
  assert.equal(
    findGeneratedDomain("cloud-production.up.railway.app"),
    "cloud-production.up.railway.app",
  );
  assert.equal(
    findGeneratedDomain([{ id: "1", domain: "cloud-production.up.railway.app" }]),
    "cloud-production.up.railway.app",
  );
  assert.equal(
    findGeneratedDomain({ serviceDomains: [{ domain: "cloud-production.up.railway.app" }] }),
    "cloud-production.up.railway.app",
  );
});

test("findGeneratedDomain ignores a custom domain with no railway.app suffix", () => {
  assert.equal(findGeneratedDomain({ customDomains: [{ domain: "api.example.com" }] }), null);
});

test("findGeneratedDomain picks the generated domain out of a list that also has a custom one", () => {
  const value = {
    serviceDomains: [{ domain: "cloud-production.up.railway.app" }],
    customDomains: [{ domain: "api.example.com" }],
  };

  assert.equal(findGeneratedDomain(value), "cloud-production.up.railway.app");
});

test("findGeneratedDomain returns null for an empty array or object", () => {
  assert.equal(findGeneratedDomain([]), null);
  assert.equal(findGeneratedDomain({}), null);
  assert.equal(findGeneratedDomain(null), null);
});

test("findGeneratedDomain is case-insensitive about the suffix", () => {
  assert.equal(
    findGeneratedDomain("Cloud-Production.UP.RAILWAY.APP"),
    "Cloud-Production.UP.RAILWAY.APP",
  );
});

// parseDomainListOutput ------------------------------------------------------

test("parseDomainListOutput reports the real CLI error when the service does not exist yet", () => {
  // Captured live: `railway domain list --service cloud --json` against the linked, empty
  // staging project exits 1 with this exact text on stderr and nothing on stdout.
  const result = parseDomainListOutput({
    exitOk: false,
    stdout: "",
    stderr: "Project has no services.\n",
  });

  assert.deepEqual(result, { ok: false, error: "Project has no services." });
});

test("parseDomainListOutput finds an existing generated domain", () => {
  const result = parseDomainListOutput({
    exitOk: true,
    stdout: JSON.stringify({ serviceDomains: [{ domain: "cloud-production.up.railway.app" }] }),
  });

  assert.deepEqual(result, { ok: true, domain: "cloud-production.up.railway.app" });
});

test("parseDomainListOutput succeeds with a null domain when the service has none yet", () => {
  const result = parseDomainListOutput({
    exitOk: true,
    stdout: JSON.stringify({ serviceDomains: [], customDomains: [] }),
  });

  assert.deepEqual(result, { ok: true, domain: null });
});

test("parseDomainListOutput fails when the exit was ok but the output is not JSON", () => {
  const result = parseDomainListOutput({ exitOk: true, stdout: "not json" });

  assert.equal(result.ok, false);
  assert.match(result.error, /not json/);
});

// parseDomainCreateOutput -----------------------------------------------------

test("parseDomainCreateOutput reads the newly created generated domain", () => {
  const result = parseDomainCreateOutput({
    exitOk: true,
    stdout: JSON.stringify({ id: "dom_1", domain: "cloud-production.up.railway.app" }),
  });

  assert.deepEqual(result, { ok: true, domain: "cloud-production.up.railway.app" });
});

test("parseDomainCreateOutput fails when the CLI call itself failed", () => {
  const result = parseDomainCreateOutput({ exitOk: false, stdout: "", stderr: "unauthorized" });

  assert.deepEqual(result, { ok: false, error: "unauthorized" });
});

test("parseDomainCreateOutput fails when the exit was ok but no generated domain is in the output", () => {
  const result = parseDomainCreateOutput({
    exitOk: true,
    stdout: JSON.stringify({ id: "dom_1", domain: "api.example.com" }),
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /no generated domain/);
});

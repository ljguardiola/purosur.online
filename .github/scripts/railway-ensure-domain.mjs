// Pure decision logic behind ensuring the cloud service has a Railway-generated domain, so the
// deploy workflow can find one to health-check without a manually maintained GitHub variable.
// Railway's IaC reference has no field for a generated `*.up.railway.app` domain ("Generated
// Railway service domains are not included in .railway/railway.ts"), so CI resolves it
// imperatively after `railway config apply`: list the service's domains, and only create one if
// none exists yet ("One Railway-provided domain per service" - safe to call at most once).
//
// The CLI's `--json` output shape for `domain list`/`domain` (create) isn't documented field by
// field, and this project has no services yet to generate a real example from, so the search
// below does not assume a specific shape: it walks the parsed JSON recursively for any string
// ending in the documented generated-domain suffix. Confirmed live against the linked, empty
// staging project: `railway domain list --service cloud --json` exits 1 with "Project has no
// services." on stderr and nothing on stdout - a real CLI failure, not JSON - which is why list
// and create output are each parsed defensively rather than assumed to be valid JSON.

const GENERATED_DOMAIN_SUFFIX = ".up.railway.app";

/** Recursively searches a parsed JSON value for the first `*.up.railway.app` string. */
export function findGeneratedDomain(value) {
  if (typeof value === "string") {
    return value.toLowerCase().endsWith(GENERATED_DOMAIN_SUFFIX) ? value : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGeneratedDomain(item);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const found = findGeneratedDomain(item);
      if (found) {
        return found;
      }
    }
    return null;
  }
  return null;
}

function parseJsonOutput(raw, describeParseFailure) {
  if (!raw.exitOk) {
    return {
      ok: false,
      error: raw.stderr?.trim() || raw.stdout?.trim() || "railway CLI call failed",
    };
  }
  try {
    return { ok: true, value: JSON.parse(raw.stdout) };
  } catch {
    return { ok: false, error: describeParseFailure(raw.stdout.trim()) };
  }
}

/**
 * @param {{ exitOk: boolean, stdout: string, stderr?: string }} raw - result of
 *   `railway domain list --service <service> --environment <environment> --json`.
 * @returns {{ ok: true, domain: string|null } | { ok: false, error: string }}
 */
export function parseDomainListOutput(raw) {
  const parsed = parseJsonOutput(
    raw,
    (stdout) => `railway domain list did not return JSON: ${stdout}`,
  );
  if (!parsed.ok) {
    return parsed;
  }
  return { ok: true, domain: findGeneratedDomain(parsed.value) };
}

/**
 * @param {{ exitOk: boolean, stdout: string, stderr?: string }} raw - result of
 *   `railway domain --service <service> --environment <environment> --json` (create).
 * @returns {{ ok: true, domain: string } | { ok: false, error: string }}
 */
export function parseDomainCreateOutput(raw) {
  const parsed = parseJsonOutput(raw, (stdout) => `railway domain did not return JSON: ${stdout}`);
  if (!parsed.ok) {
    return parsed;
  }
  const domain = findGeneratedDomain(parsed.value);
  return domain
    ? { ok: true, domain }
    : { ok: false, error: `no generated domain found in create output: ${raw.stdout.trim()}` };
}

async function runCommand(execFileAsync, args) {
  try {
    const { stdout } = await execFileAsync("railway", args);
    return { exitOk: true, stdout };
  } catch (error) {
    return {
      exitOk: false,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? String(error.message ?? error),
    };
  }
}

async function runCli() {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  const service = process.env.RAILWAY_SERVICE;
  const environment = process.env.RAILWAY_ENVIRONMENT;
  if (!service || !environment) {
    console.error("railway-ensure-domain: RAILWAY_SERVICE and RAILWAY_ENVIRONMENT are required");
    process.exit(1);
    return;
  }

  const commonArgs = ["--service", service, "--environment", environment, "--json"];

  const listRaw = await runCommand(execFileAsync, ["domain", "list", ...commonArgs]);
  const listed = parseDomainListOutput(listRaw);
  if (!listed.ok) {
    console.error(`railway-ensure-domain: could not list domains: ${listed.error}`);
    process.exit(1);
    return;
  }

  let domain = listed.domain;
  if (domain) {
    console.log(`railway-ensure-domain: found existing generated domain ${domain}`);
  } else {
    console.log("railway-ensure-domain: no generated domain yet, creating one");
    // RAILWAY_DOMAIN_PORT is opt-in: the app reads Railway's own injected PORT (see
    // apps/cloud/src/server.ts), so the generated domain does not need an explicit target port
    // unless a future change makes that assumption wrong.
    const port = process.env.RAILWAY_DOMAIN_PORT;
    const createArgs = port ? ["domain", "--port", port, ...commonArgs] : ["domain", ...commonArgs];
    const createRaw = await runCommand(execFileAsync, createArgs);
    const created = parseDomainCreateOutput(createRaw);
    if (!created.ok) {
      console.error(`railway-ensure-domain: could not create a domain: ${created.error}`);
      process.exit(1);
      return;
    }
    domain = created.domain;
    console.log(`railway-ensure-domain: created domain ${domain}`);
  }

  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(outputPath, `domain=${domain}\n`);
  } else {
    console.log(domain);
  }
}

const isMainModule =
  process.argv[1] !== undefined && process.argv[1] === new URL(import.meta.url).pathname;
if (isMainModule) {
  runCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

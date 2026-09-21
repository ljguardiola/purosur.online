// Pure decision logic behind ensuring the cloud service has a Railway-generated domain, so the
// deploy workflow can find one to health-check without a manually maintained GitHub variable.
// Railway's IaC reference has no field for a generated `*.up.railway.app` domain ("Generated
// Railway service domains are not included in .railway/railway.ts"), so CI resolves it
// imperatively after `railway config apply`: list the service's domains, and only create one if
// none exists yet ("One Railway-provided domain per service" - safe to call at most once).
//
// The real shape, captured live from a sandbox run's `railway domain list --service cloud --json`
// against a live "cloud" service: `{"domains":[{"id":"…","domain":"cloud-staging-6fea.up.railway
// .app","type":"service","targetPort":null,"syncStatus":"ACTIVE",…}]}` - a bare hostname, no
// scheme, with `type: "service"` distinguishing it from a custom domain in the same array.
//
// The create command's own output is not parsed for a domain at all: the same sandbox run showed
// it carrying a scheme (`https://cloud-staging-6fea.up.railway.app`), which is why an earlier
// version of this script building `https://${created domain}/health` produced a doubled-scheme
// URL and every health check failed. Create output is now opaque - only its exit status matters -
// and the domain is always read back from a re-list afterward, the same call already trusted for
// the "domain already exists" path.
//
// Confirmed live against the linked, empty "Puro Sur" staging project (no services yet):
// `railway domain list --service cloud --json` exits 1 with "Project has no services." on stderr
// and nothing on stdout - a real CLI failure, not JSON - which is why list output is parsed
// defensively rather than assumed to be valid JSON.

/** Reads the domain off the entry whose `type` is `"service"` (a generated `*.up.railway.app`). */
export function findServiceDomain(parsedList) {
  const domains = parsedList?.domains;
  if (!Array.isArray(domains)) {
    return null;
  }
  const entry = domains.find((candidate) => candidate?.type === "service");
  return entry?.domain ?? null;
}

/**
 * @param {{ exitOk: boolean, stdout: string, stderr?: string }} raw - result of
 *   `railway domain list --service <service> --environment <environment> --json`.
 * @returns {{ ok: true, domain: string|null } | { ok: false, error: string }}
 */
export function parseDomainListOutput(raw) {
  if (!raw.exitOk) {
    return {
      ok: false,
      error: raw.stderr?.trim() || raw.stdout?.trim() || "railway domain list failed",
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw.stdout);
  } catch {
    return { ok: false, error: `railway domain list did not return JSON: ${raw.stdout.trim()}` };
  }
  return { ok: true, domain: findServiceDomain(parsed) };
}

/**
 * Confirms only that the create call itself succeeded; its output is never parsed for a domain
 * (see the module comment above) - the caller always re-lists afterward instead.
 *
 * @param {{ exitOk: boolean, stdout: string, stderr?: string }} raw - result of
 *   `railway domain --service <service> --environment <environment> --json` (create).
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function parseDomainCreateOutput(raw) {
  if (!raw.exitOk) {
    return {
      ok: false,
      error: raw.stderr?.trim() || raw.stdout?.trim() || "railway domain create failed",
    };
  }
  return { ok: true };
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

  async function listDomain() {
    const raw = await runCommand(execFileAsync, ["domain", "list", ...commonArgs]);
    return parseDomainListOutput(raw);
  }

  let listed = await listDomain();
  if (!listed.ok) {
    console.error(`railway-ensure-domain: could not list domains: ${listed.error}`);
    process.exit(1);
    return;
  }

  if (listed.domain) {
    console.log(`railway-ensure-domain: found existing generated domain ${listed.domain}`);
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

    listed = await listDomain();
    if (!listed.ok) {
      console.error(
        `railway-ensure-domain: created a domain but could not re-list to read it back: ${listed.error}`,
      );
      process.exit(1);
      return;
    }
    if (!listed.domain) {
      console.error("railway-ensure-domain: created a domain but none was found on re-list");
      process.exit(1);
      return;
    }
    console.log(`railway-ensure-domain: created domain ${listed.domain}`);
  }

  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(outputPath, `domain=${listed.domain}\n`);
  } else {
    console.log(listed.domain);
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

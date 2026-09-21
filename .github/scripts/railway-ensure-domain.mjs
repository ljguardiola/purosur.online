// Ensures the cloud service has a Railway-generated domain, which Railway IaC cannot declare:
// list the service's domains and create one only when none exists (Railway allows one generated
// domain per service).
//
// `railway domain list --json` returns `{"domains":[{"domain":"<bare hostname>","type":"service",
// …}]}`, where `type` tells a generated domain from a custom one. The create command's `domain`
// carries a scheme, so the domain is always read back from a re-list instead. When the service
// does not exist yet, `domain list` exits 1 with plain text on stderr, not JSON.

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
 * Confirms only that the create call itself succeeded; its output is never parsed for a domain,
 * the caller re-lists afterward instead.
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
    // Without a port, the generated domain targets the PORT Railway injects, which the app reads.
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

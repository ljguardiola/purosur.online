export type SampleDataTarget = "local" | "staging" | "refused";

export interface ResolveSampleDataTargetInput {
  databaseUrl: string | undefined;
  railwayEnvironmentName: string | undefined;
}

// `URL`'s own hostname keeps the brackets around an IPv6 literal (e.g. "[::1]").
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLoopbackDatabaseUrl(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return false;
  }
  return LOOPBACK_HOSTS.has(url.hostname);
}

export function resolveSampleDataTarget(input: ResolveSampleDataTargetInput): SampleDataTarget {
  if (input.railwayEnvironmentName === "staging") {
    return "staging";
  }
  if (input.railwayEnvironmentName === undefined && isLoopbackDatabaseUrl(input.databaseUrl)) {
    return "local";
  }
  return "refused";
}

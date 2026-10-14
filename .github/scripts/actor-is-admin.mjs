import { MAX_REQUEST_TIMEOUT_MS } from "./verify-cloud-health.mjs";

const LOG_PREFIX = "actor-is-admin";

export async function actorIsAdmin({ repository, actor, token, fetchImpl = fetch }) {
  try {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repository}/collaborators/${encodeURIComponent(actor)}/permission`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(MAX_REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      return false;
    }
    const body = await response.json();
    return body?.permission === "admin";
  } catch {
    return false;
  }
}

export async function runCli({
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
  logError = console.error,
} = {}) {
  const { GITHUB_REPOSITORY, GITHUB_TOKEN, ACTOR } = env;
  if (!GITHUB_REPOSITORY || !GITHUB_TOKEN || !ACTOR) {
    logError(`${LOG_PREFIX}: GITHUB_REPOSITORY, GITHUB_TOKEN and ACTOR are required`);
    return 1;
  }
  const isAdmin = await actorIsAdmin({
    repository: GITHUB_REPOSITORY,
    actor: ACTOR,
    token: GITHUB_TOKEN,
    fetchImpl,
  });
  if (!isAdmin) {
    logError(
      `${LOG_PREFIX}: ${ACTOR} is not confirmed as an administrator of ${GITHUB_REPOSITORY}`,
    );
    return 1;
  }
  log(`${LOG_PREFIX}: ${ACTOR} is an administrator of ${GITHUB_REPOSITORY}`);
  return 0;
}

if (import.meta.main) {
  runCli().then(
    (exitCode) => process.exit(exitCode),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}

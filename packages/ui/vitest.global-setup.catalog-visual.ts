import { createRequire } from "node:module";
import { dirname } from "node:path";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";

const require = createRequire(import.meta.url);

// Pinned to the installed Playwright version, so the browser this container runs is always the
// exact build the lockfile's client library expects to speak to.
const PLAYWRIGHT_VERSION = (require("playwright/package.json") as { version: string }).version;
const PLAYWRIGHT_SERVER_IMAGE = `mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble`;

// playwright-core is playwright's own dependency, not this package's; resolving it from
// playwright's location (rather than requiring it directly) finds the exact copy playwright
// itself would load, regardless of how the workspace happens to lay out node_modules.
const PLAYWRIGHT_CORE_DIRECTORY = dirname(
  createRequire(require.resolve("playwright")).resolve("playwright-core/package.json"),
);

const PLAYWRIGHT_SERVER_PORT = 3000;

export const CATALOG_VISUAL_WS_ENDPOINT_ENV = "CATALOG_VISUAL_BROWSER_WS_ENDPOINT";

// Same rendering environment everywhere a screenshot is taken, host OS included: a missing
// Docker fails this project's run loudly instead of silently skipping it, like apps/cloud's own
// Postgres container setup does.
export default async function setup(): Promise<() => Promise<void>> {
  let container: StartedTestContainer;
  try {
    container = await new GenericContainer(PLAYWRIGHT_SERVER_IMAGE)
      .withBindMounts([
        { source: PLAYWRIGHT_CORE_DIRECTORY, target: "/playwright-core", mode: "ro" },
      ])
      .withCommand([
        "node",
        "/playwright-core/cli.js",
        "run-server",
        "--port",
        String(PLAYWRIGHT_SERVER_PORT),
        "--host",
        "0.0.0.0",
      ])
      .withExposedPorts(PLAYWRIGHT_SERVER_PORT)
      .withWaitStrategy(Wait.forLogMessage(/Listening on/))
      .withStartupTimeout(240_000)
      .start();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      "packages/ui's catalog-visual project requires a working Docker daemon to run a remote " +
        `Chromium via Testcontainers (image ${PLAYWRIGHT_SERVER_IMAGE}). Starting the container ` +
        `failed: ${reason}. Start Docker and retry; these tests are never skipped.`,
      { cause: error },
    );
  }

  process.env[CATALOG_VISUAL_WS_ENDPOINT_ENV] =
    `ws://${container.getHost()}:${container.getMappedPort(PLAYWRIGHT_SERVER_PORT)}/`;

  return async () => {
    await container.stop();
  };
}

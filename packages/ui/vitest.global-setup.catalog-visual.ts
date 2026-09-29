import { createRequire } from "node:module";
import { dirname } from "node:path";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";

const require = createRequire(import.meta.url);

// Its tag must be the installed Playwright version, so the browser this container runs is the exact
// build the lockfile's client library expects to speak to.
const PLAYWRIGHT_SERVER_IMAGE =
  "mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27";

const PLAYWRIGHT_CORE_DIRECTORY = dirname(
  createRequire(require.resolve("playwright")).resolve("playwright-core/package.json"),
);

const PLAYWRIGHT_SERVER_PORT = 3000;

export const CATALOG_VISUAL_WS_ENDPOINT_ENV = "CATALOG_VISUAL_BROWSER_WS_ENDPOINT";

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

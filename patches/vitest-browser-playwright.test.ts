import { createServer, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { afterEach, expect, test } from "vitest";
import { createVitest, type TestModule, type Vitest } from "vitest/node";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const FIXTURE = "patches/test-support/renders-in-the-browser.fixture.ts";

const heldResponses: ServerResponse[] = [];
const neverAnswers = createServer((_request, response) => {
  heldResponses.push(response);
});
let nested: Vitest | undefined;

async function urlThatNeverAnswers(): Promise<string> {
  await new Promise<void>((resolve) => neverAnswers.listen(0, "127.0.0.1", resolve));
  const address = neverAnswers.address();
  if (address === null || typeof address === "string") throw new Error("expected a TCP address");
  return `http://127.0.0.1:${address.port}/`;
}

afterEach(async () => {
  await nested?.close();
  for (const response of heldResponses.splice(0)) response.destroy();
  neverAnswers.closeAllConnections();
  await new Promise((resolve) => neverAnswers.close(resolve));
});

test("a browser run ends once its files finish, even when the runner page never finishes loading", {
  timeout: 120_000,
}, async () => {
  const pendingImage = await urlThatNeverAnswers();
  const finished: TestModule[] = [];
  nested = await createVitest(
    "test",
    {
      root: ROOT,
      config: false,
      watch: false,
      include: [FIXTURE],
      reporters: [{ onTestModuleEnd: (module) => void finished.push(module) }],
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({
          connectOptions: {
            wsEndpoint: process.env["PLAYWRIGHT_SERVER_WS_ENDPOINT"] ?? "",
            exposeNetwork: "<loopback>",
          },
        }),
        instances: [{ browser: "chromium" }],
        orchestratorScripts: [
          {
            type: "module",
            content: `const image = document.createElement("img"); image.src = ${JSON.stringify(pendingImage)}; document.documentElement.append(image);`,
          },
        ],
      },
    },
    { server: { host: "127.0.0.1" } },
  );

  await nested.start();

  expect(finished.map((module) => [module.moduleId, module.state()])).toEqual([
    [`${ROOT}${FIXTURE}`, "passed"],
  ]);
});

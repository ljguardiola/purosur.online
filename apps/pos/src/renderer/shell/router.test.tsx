import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { CoreStatus } from "./router";
import { routeTree } from "./router";

const CORE_DOWN_TITLE = "Esperá un momento";
const SHELL_READY_TEXT = "Puro Sur está listo";

function routerAt(path: "/" | "/starting" | "/core-down", coreStatus: CoreStatus) {
  return createRouter({
    routeTree,
    context: { coreStatus },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
}

describe("the register's router", () => {
  it("redirects away from the ready route when the core is not up", async () => {
    const router = routerAt("/", "down");

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByText(CORE_DOWN_TITLE)).toBeVisible();
    await expect.element(screen.getByText(SHELL_READY_TEXT)).not.toBeInTheDocument();
  });

  it("renders the ready route once the core is up", async () => {
    const router = routerAt("/", "up");

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByText(SHELL_READY_TEXT)).toBeVisible();
  });
});

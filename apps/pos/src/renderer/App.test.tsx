import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { App } from "./App";

const SHELL_READY_TEXT = "Puro Sur está listo";
const BRAND_LOGO_ALT = "Puro Sur";
const CORE_DOWN_TITLE = "Esperá un momento";

function postCoreStatus(status: "starting" | "down" | "up"): void {
  window.postMessage({ channel: "core-status", payload: { type: "core-status", status } }, "*");
}

describe("App", () => {
  it("shows only the brand panel before the core reports it is ready", async () => {
    const screen = await render(<App />);

    await expect.element(screen.getByRole("img", { name: BRAND_LOGO_ALT })).toBeVisible();
    await expect.element(screen.getByText(SHELL_READY_TEXT)).not.toBeInTheDocument();
    await expect.element(screen.getByText(CORE_DOWN_TITLE)).not.toBeInTheDocument();
  });

  it("leaves the register for the brand panel when a core that was up starts again", async () => {
    const screen = await render(<App />);
    postCoreStatus("up");
    await expect.element(screen.getByText(SHELL_READY_TEXT)).toBeVisible();

    postCoreStatus("starting");

    await expect.element(screen.getByRole("img", { name: BRAND_LOGO_ALT })).toBeVisible();
    await expect.element(screen.getByText(SHELL_READY_TEXT)).not.toBeInTheDocument();
    await expect.element(screen.getByText(CORE_DOWN_TITLE)).not.toBeInTheDocument();
  });

  it("renders the ready message once the core reports it is up", async () => {
    const screen = await render(<App />);

    postCoreStatus("up");

    await expect.element(screen.getByText(SHELL_READY_TEXT)).toBeVisible();
  });

  it("replaces the whole screen with the core-down notice once the core reports it is down", async () => {
    const screen = await render(<App />);

    postCoreStatus("down");

    await expect.element(screen.getByText(CORE_DOWN_TITLE)).toBeVisible();
    await expect.element(screen.getByText(SHELL_READY_TEXT)).not.toBeInTheDocument();
  });

  it("shows the notice when the core went down before the page started listening", async () => {
    const replyToStatusRequestWithDown = (event: MessageEvent) => {
      if (
        typeof event.data === "object" &&
        event.data !== null &&
        event.data.channel === "core-status-request"
      ) {
        postCoreStatus("down");
      }
    };
    window.addEventListener("message", replyToStatusRequestWithDown);

    try {
      const screen = await render(<App />);

      await expect.element(screen.getByText(CORE_DOWN_TITLE)).toBeVisible();
    } finally {
      window.removeEventListener("message", replyToStatusRequestWithDown);
    }
  });

  it("shows the register again once the core reports it is back up", async () => {
    const screen = await render(<App />);

    postCoreStatus("down");
    await expect.element(screen.getByText(CORE_DOWN_TITLE)).toBeVisible();

    postCoreStatus("up");

    await expect.element(screen.getByText(SHELL_READY_TEXT)).toBeVisible();
    await expect.element(screen.getByText(CORE_DOWN_TITLE)).not.toBeInTheDocument();
  });
});

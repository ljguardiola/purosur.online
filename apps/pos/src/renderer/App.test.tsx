import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { messages } from "../messages";
import { App } from "./App";

function postCoreStatus(status: "starting" | "down" | "up"): void {
  window.postMessage({ channel: "core-status", payload: { type: "core-status", status } }, "*");
}

describe("App", () => {
  it("shows neither the register nor the notice before the core reports it is ready", async () => {
    const screen = await render(<App />);

    postCoreStatus("starting");

    await expect.element(screen.getByText(messages.shell.ready)).not.toBeInTheDocument();
    await expect.element(screen.getByText(messages.coreDown.title)).not.toBeInTheDocument();
  });

  it("renders the ready message from the message catalog once the core reports it is up", async () => {
    const screen = await render(<App />);

    postCoreStatus("up");

    await expect.element(screen.getByText(messages.shell.ready)).toBeVisible();
  });

  it("replaces the whole screen with the core-down notice once the core reports it is down", async () => {
    const screen = await render(<App />);

    postCoreStatus("down");

    await expect.element(screen.getByText(messages.coreDown.title)).toBeVisible();
    await expect.element(screen.getByText(messages.shell.ready)).not.toBeInTheDocument();
  });

  it("shows the notice when the core went down before the page started listening", async () => {
    // Stands in for the preload: the down status reached it before App mounted, so it can only
    // be delivered as the reply to App's own request.
    const answerRequest = (event: MessageEvent) => {
      if (
        typeof event.data === "object" &&
        event.data !== null &&
        event.data.channel === "core-status-request"
      ) {
        postCoreStatus("down");
      }
    };
    window.addEventListener("message", answerRequest);

    try {
      const screen = await render(<App />);

      await expect.element(screen.getByText(messages.coreDown.title)).toBeVisible();
    } finally {
      window.removeEventListener("message", answerRequest);
    }
  });

  it("shows the register again once the core reports it is back up", async () => {
    const screen = await render(<App />);

    postCoreStatus("down");
    await expect.element(screen.getByText(messages.coreDown.title)).toBeVisible();

    postCoreStatus("up");

    await expect.element(screen.getByText(messages.shell.ready)).toBeVisible();
    await expect.element(screen.getByText(messages.coreDown.title)).not.toBeInTheDocument();
  });
});

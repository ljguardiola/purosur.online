import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { messages } from "../messages";
import { App } from "./App";

function postCoreStatus(status: "down" | "up"): void {
  window.postMessage({ channel: "core-status", payload: { type: "core-status", status } }, "*");
}

describe("App", () => {
  it("renders the ready message from the message catalog", async () => {
    const screen = await render(<App />);

    await expect.element(screen.getByText(messages.shell.ready)).toBeVisible();
  });

  it("replaces the whole screen with the core-down notice once the core reports it is down", async () => {
    const screen = await render(<App />);

    postCoreStatus("down");

    await expect.element(screen.getByText(messages.coreDown.title)).toBeVisible();
    await expect.element(screen.getByText(messages.shell.ready)).not.toBeInTheDocument();
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

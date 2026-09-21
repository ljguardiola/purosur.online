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

  it("shows the register again once the core reports it is back up", async () => {
    const screen = await render(<App />);

    postCoreStatus("down");
    await expect.element(screen.getByText(messages.coreDown.title)).toBeVisible();

    postCoreStatus("up");

    await expect.element(screen.getByText(messages.shell.ready)).toBeVisible();
    await expect.element(screen.getByText(messages.coreDown.title)).not.toBeInTheDocument();
  });
});

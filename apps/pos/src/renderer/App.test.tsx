import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { messages } from "../messages";
import { App } from "./App";

describe("App", () => {
  it("renders the ready message from the message catalog", async () => {
    const screen = await render(<App />);

    await expect.element(screen.getByText(messages.shell.ready)).toBeVisible();
  });
});

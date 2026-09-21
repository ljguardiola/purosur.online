import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { messages } from "../messages";
import { CoreDownNotice } from "./CoreDownNotice";

describe("CoreDownNotice", () => {
  it("shows the catalog's title and body", async () => {
    const screen = await render(<CoreDownNotice />);

    await expect.element(screen.getByText(messages.coreDown.title)).toBeVisible();
    await expect.element(screen.getByText(messages.coreDown.body)).toBeVisible();
  });

  it("announces itself to assistive technology as an urgent, page-level message", async () => {
    const screen = await render(<CoreDownNotice />);

    await expect.element(screen.getByRole("alert")).toBeVisible();
  });

  it("shows the brand panel's logo with its accessible name", async () => {
    const screen = await render(<CoreDownNotice />);

    await expect.element(screen.getByRole("img", { name: "Puro Sur" })).toBeVisible();
  });
});

import { describe, expect, it } from "vitest";
import { OpenSessionRail } from "./open-session-rail";
import { render } from "./test-support/render-with-router";

describe("OpenSessionRail", () => {
  it("marks Venta as current on the sale screen", async () => {
    const screen = await render(<OpenSessionRail firstName="Ada" current="sale" />);

    await expect
      .element(screen.getByRole("button", { name: "Venta" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(screen.getByRole("link", { name: "Caja" }))
      .not.toHaveAttribute("aria-current");
  });

  it("marks Caja as current on the cash screens and sends Venta to the sale", async () => {
    const screen = await render(<OpenSessionRail firstName="Ada" current="cash" />);

    await expect
      .element(screen.getByRole("link", { name: "Caja" }))
      .toHaveAttribute("aria-current", "page");
    const venta = screen.getByRole("link", { name: "Venta" });
    await expect.element(venta).not.toHaveAttribute("aria-current");
    expect(venta.element().getAttribute("href")).toBe("/session");
  });
});

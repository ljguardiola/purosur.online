import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { ReturnPanelFigure } from "./return-panel-figure";

describe("ReturnPanelFigure", () => {
  it("shows its label, its value and Esc", async () => {
    const screen = await render(<ReturnPanelFigure label="A REINTEGRAR" value="$ 9.700,00" />);

    await expect.element(screen.getByText("A REINTEGRAR")).toBeVisible();
    await expect.element(screen.getByText("$ 9.700,00")).toBeVisible();
    await expect.element(screen.getByText("Esc", { exact: true })).toBeVisible();
  });

  it("shows its value loading while it has none", async () => {
    const screen = await render(<ReturnPanelFigure label="A REINTEGRAR" value={undefined} />);

    await expect.element(screen.getByText("A REINTEGRAR")).toBeVisible();
    expect(screen.container.querySelector("[aria-busy='true']")).not.toBeNull();
  });
});

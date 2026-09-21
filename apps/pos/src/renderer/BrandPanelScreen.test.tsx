import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { messages } from "../messages";
import { BrandPanelScreen } from "./BrandPanelScreen";

describe("BrandPanelScreen", () => {
  it("shows the brand panel's logo with its accessible name", async () => {
    const screen = await render(<BrandPanelScreen />);

    await expect.element(screen.getByRole("img", { name: messages.brand.logoAlt })).toBeVisible();
  });

  it("shows its content beside the brand panel", async () => {
    const screen = await render(
      <BrandPanelScreen>
        <p>content</p>
      </BrandPanelScreen>,
    );

    await expect.element(screen.getByText("content")).toBeVisible();
  });
});

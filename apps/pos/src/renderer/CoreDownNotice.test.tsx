import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CoreDownNotice } from "./CoreDownNotice";

describe("CoreDownNotice", () => {
  it("shows the title and body", async () => {
    const screen = await render(<CoreDownNotice />);

    await expect.element(screen.getByText("Esperá un momento")).toBeVisible();
    await expect
      .element(screen.getByText("La caja vuelve a funcionar sola en unos minutos."))
      .toBeVisible();
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

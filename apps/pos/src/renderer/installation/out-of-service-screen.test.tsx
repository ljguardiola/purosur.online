import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { OutOfServiceScreen } from "./out-of-service-screen";

const TITLE = "La caja necesita restaurarse";
const DESCRIPTION = "Su base de datos está dañada, así que no puede vender.";

describe("OutOfServiceScreen", () => {
  it("says the register needs restoring and why it cannot sell", async () => {
    const screen = await render(<OutOfServiceScreen />);

    await expect.element(screen.getByText(TITLE)).toBeVisible();
    await expect.element(screen.getByText(DESCRIPTION)).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("offers nothing to press", async () => {
    const screen = await render(<OutOfServiceScreen />);

    await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("link")).not.toBeInTheDocument();
  });
});

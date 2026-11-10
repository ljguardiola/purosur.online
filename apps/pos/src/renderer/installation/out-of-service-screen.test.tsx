import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { OutOfServiceScreen } from "./out-of-service-screen";

const TITLE = "La caja necesita restaurarse";
const NOTICE_TITLE = "Su base de datos está dañada";
const NOTICE_DESCRIPTION = "No puede vender.";

describe("OutOfServiceScreen", () => {
  it("says the register needs restoring and why it cannot sell", async () => {
    const screen = await render(<OutOfServiceScreen version={null} />);

    await expect.element(screen.getByText(TITLE)).toBeVisible();
    await expect.element(screen.getByText(NOTICE_TITLE, { exact: true })).toBeVisible();
    await expect.element(screen.getByText(NOTICE_DESCRIPTION, { exact: true })).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("offers nothing to press", async () => {
    const screen = await render(<OutOfServiceScreen version={null} />);

    await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("link")).not.toBeInTheDocument();
  });

  it("shows the register's version at the foot of the brand panel once it is known", async () => {
    const screen = await render(<OutOfServiceScreen version="1.4.212" />);

    await expect.element(screen.getByText("Versión 1.4.212", { exact: true })).toBeVisible();
  });
});

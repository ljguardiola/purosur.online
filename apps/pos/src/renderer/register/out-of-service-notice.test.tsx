import { InlineNotice } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { Ban } from "lucide-react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { surfaceBehind } from "../shell/test-support/surface-behind";
import { OutOfServiceNotice } from "./out-of-service-notice";

const TITLE = "La caja necesita restaurarse";
const DESCRIPTION =
  "La base de datos de esta caja está dañada y no puede vender. Hay que restaurarla para volver a vender.";

describe("OutOfServiceNotice", () => {
  it("says the register needs restoring and why it cannot sell", async () => {
    const screen = await render(<OutOfServiceNotice />);

    await expect.element(screen.getByText(TITLE)).toBeVisible();
    await expect.element(screen.getByText(DESCRIPTION)).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("offers nothing to press", async () => {
    const screen = await render(<OutOfServiceNotice />);

    await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("link")).not.toBeInTheDocument();
  });

  it("announces itself to assistive technology as an urgent, page-level message", async () => {
    const screen = await render(<OutOfServiceNotice />);

    const alert = screen.getByRole("alert").element();
    await expect.poll(() => alert.textContent).toContain(TITLE);
    await expect.poll(() => alert.textContent).toContain(DESCRIPTION);
  });

  it("shows the notice on the error-tone surface", async () => {
    const screen = await render(<OutOfServiceNotice />);
    const reference = await render(<InlineNotice tone="error" icon={<Ban />} title="Reference" />);

    expect(surfaceBehind(screen.getByText(TITLE).first().element())).toBe(
      surfaceBehind(reference.container.querySelector("p") as HTMLElement),
    );
  });

  it("shows the brand panel's logo with its accessible name", async () => {
    const screen = await render(<OutOfServiceNotice />);

    await expect.element(screen.getByRole("img", { name: "Puro Sur" })).toBeVisible();
  });
});

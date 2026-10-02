import { InlineNotice } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { Hourglass } from "lucide-react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CoreDownNotice } from "./core-down-notice";
import { surfaceBehind } from "./test-support/surface-behind";

describe("CoreDownNotice", () => {
  it("shows the title and body", async () => {
    const screen = await render(<CoreDownNotice />);

    await expect.element(screen.getByText("Esperá un momento")).toBeVisible();
    await expect
      .element(screen.getByText("La caja vuelve a funcionar sola en unos minutos."))
      .toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("announces itself to assistive technology as an urgent, page-level message", async () => {
    const screen = await render(<CoreDownNotice />);

    const alert = screen.getByRole("alert").element();
    await expect.poll(() => alert.textContent).toContain("Esperá un momento");
    await expect
      .poll(() => alert.textContent)
      .toContain("La caja vuelve a funcionar sola en unos minutos.");
  });

  it("shows the notice on the error-tone surface", async () => {
    const screen = await render(<CoreDownNotice />);
    const reference = await render(
      <InlineNotice tone="error" icon={<Hourglass />} title="Reference" />,
    );

    expect(surfaceBehind(screen.getByText("Esperá un momento").first().element())).toBe(
      surfaceBehind(reference.container.querySelector("p") as HTMLElement),
    );
  });

  it("shows the brand panel's logo with its accessible name", async () => {
    const screen = await render(<CoreDownNotice />);

    await expect.element(screen.getByRole("img", { name: "Puro Sur" })).toBeVisible();
  });
});

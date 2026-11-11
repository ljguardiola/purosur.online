import { InlineNotice } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { Hourglass } from "lucide-react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CoreDownNotice } from "./core-down-notice";
import { elevatedCardOf, elevatedCardWithBadge } from "./test-support/elevated-card";
import { surfaceBehind } from "./test-support/surface-behind";

describe("CoreDownNotice", () => {
  it("shows the title and body", async () => {
    const screen = await render(<CoreDownNotice version={null} />);

    await expect.element(screen.getByText("Esperá un momento")).toBeVisible();
    await expect
      .element(screen.getByText("La caja vuelve a funcionar sola en unos minutos", { exact: true }))
      .toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("announces itself to assistive technology as an urgent, page-level message", async () => {
    const screen = await render(<CoreDownNotice version={null} />);

    const alert = screen.getByRole("alert").element();
    await expect
      .poll(() => alert.textContent)
      .toContain("La caja vuelve a funcionar sola en unos minutos");
  });

  it("shows its title as the heading of an elevated card with an error-tone badge, apart from the notice", async () => {
    const screen = await render(<CoreDownNotice version={null} />);

    const heading = screen.getByRole("heading", { level: 1, name: "Esperá un momento" });
    await expect.element(heading).toBeVisible();
    expect(elevatedCardOf(heading.element())).toEqual(elevatedCardWithBadge("error"));
    expect(screen.getByRole("alert").element().contains(heading.element())).toBe(false);
  });

  it("shows the notice on the error-tone surface", async () => {
    const screen = await render(<CoreDownNotice version={null} />);
    const reference = await render(
      <InlineNotice tone="error" icon={<Hourglass />} title="Reference" />,
    );

    expect(
      surfaceBehind(screen.getByText("La caja vuelve a funcionar sola en unos minutos").element()),
    ).toBe(surfaceBehind(reference.container.querySelector("p") as HTMLElement));
  });

  it("shows the brand panel's logo with its accessible name", async () => {
    const screen = await render(<CoreDownNotice version={null} />);

    await expect.element(screen.getByRole("img", { name: "Puro Sur" })).toBeVisible();
  });

  it("shows the register's version at the foot of the brand panel once it is known", async () => {
    const screen = await render(<CoreDownNotice version="1.4.212" />);

    await expect.element(screen.getByText("Versión 1.4.212", { exact: true })).toBeVisible();
  });
});

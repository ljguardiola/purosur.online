import { InlineNotice } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { RefreshCw } from "lucide-react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { RegisterUpdatingNotice } from "./register-updating-notice";
import { surfaceBehind } from "./test-support/surface-behind";

describe("RegisterUpdatingNotice", () => {
  it("shows the title and body", async () => {
    const screen = await render(<RegisterUpdatingNotice version={null} />);

    await expect.element(screen.getByText("Actualizando la caja")).toBeVisible();
    await expect
      .element(screen.getByText("Vuelve a abrirse sola en un momento", { exact: true }))
      .toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the notice on the info-tone surface", async () => {
    const screen = await render(<RegisterUpdatingNotice version={null} />);
    const reference = await render(
      <InlineNotice tone="info" icon={<RefreshCw />} title="Reference" />,
    );

    expect(surfaceBehind(screen.getByText("Actualizando la caja").first().element())).toBe(
      surfaceBehind(reference.container.querySelector("p") as HTMLElement),
    );
  });

  it("shows the brand panel's logo with its accessible name", async () => {
    const screen = await render(<RegisterUpdatingNotice version={null} />);

    await expect.element(screen.getByRole("img", { name: "Puro Sur" })).toBeVisible();
  });

  it("shows the register's version at the foot of the brand panel once it is known", async () => {
    const screen = await render(<RegisterUpdatingNotice version="1.4.212" />);

    await expect.element(screen.getByText("Versión 1.4.212", { exact: true })).toBeVisible();
  });
});

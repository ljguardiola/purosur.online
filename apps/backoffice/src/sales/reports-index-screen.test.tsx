import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { ReportsIndexScreen } from "./reports-index-screen";

test("lists the sales by day report as a link to it", async () => {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <ReportsIndexScreen />
      </main>
    </FieldSizeProvider>,
  );

  await expect.element(screen.getByRole("heading", { name: "Reportes", level: 1 })).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Ventas por día o por rango" }))
    .toHaveAttribute("href", "/reports/sales-by-day");
  await expectNoAccessibilityViolations(screen.container);
});

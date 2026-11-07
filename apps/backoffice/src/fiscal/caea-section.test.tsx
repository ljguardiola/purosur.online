import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { CaeaSection } from "./caea-section";

test("names its region by its title and carries its anchor, holding what it is handed", async () => {
  const screen = await render(
    <main>
      <CaeaSection anchor="fortnight-reports" title="Informes quincenales">
        <p>Contenido de la sección</p>
      </CaeaSection>
    </main>,
  );

  const region = screen.getByRole("region", { name: "Informes quincenales" });
  await expect.element(region).toHaveAttribute("id", "fortnight-reports");
  await expect
    .element(region.getByRole("heading", { name: "Informes quincenales", level: 2 }))
    .toBeVisible();
  await expect.element(region.getByText("Contenido de la sección")).toBeVisible();
});

import { Lock } from "lucide-react";
import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { BrandPanelCard } from "./brand-panel-card";

it("shows the card as the screen's main content", async () => {
  const screen = await render(
    <BrandPanelCard icon={<Lock />} title="Ingresá tu PIN">
      <p>Contenido</p>
    </BrandPanelCard>,
  );

  await expect
    .element(screen.getByRole("main").getByRole("heading", { name: "Ingresá tu PIN" }))
    .toBeVisible();
  await expect.element(screen.getByRole("main").getByText("Contenido")).toBeVisible();
});

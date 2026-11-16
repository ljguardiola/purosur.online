import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { ProductRecipeSectionServices } from "./product-recipe-section";
import { ProductRecipeSection } from "./product-recipe-section";
import {
  assemblyBatchList,
  infusionsBatch,
  mixBatch,
  voidedBatch,
} from "./test-support/assembly-batches";
import { almendras, mixDeFrutosSecos, nueces } from "./test-support/recipes";

function createServices(): ProductRecipeSectionServices {
  return {
    fetchRecipes: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { recipes: [mixDeFrutosSecos], products: [] },
    }),
    fetchAssemblyBatches: vi.fn().mockResolvedValue({
      kind: "ok",
      value: assemblyBatchList([mixBatch, voidedBatch, infusionsBatch]),
    }),
    fetchAssemblyBatchPreview: vi.fn().mockReturnValue(new Promise(() => {})),
    registerAssemblyBatch: vi.fn(),
    voidAssemblyBatch: vi.fn(),
  };
}

const PANEL_WIDTH = 325;
const SCREEN_WIDTH = 1200;

function renderSection(
  services: ProductRecipeSectionServices,
  {
    mayManageBatches = true,
    width = SCREEN_WIDTH,
  }: { mayManageBatches?: boolean; width?: number } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <div style={{ width: `${width}px` }}>
        <ProductRecipeSection
          productId={mixDeFrutosSecos.productId}
          productName={mixDeFrutosSecos.productName}
          saleUnit="KG"
          mayManageBatches={mayManageBatches}
          onSessionEnded={() => {}}
          services={services}
        />
      </div>
    </FieldSizeProvider>,
  );
}

test("shows the components of the recipe", async () => {
  const screen = await renderSection(createServices());

  await expect.element(screen.getByText(almendras.name, { exact: true })).toBeVisible();
  await expect.element(screen.getByText(nueces.name, { exact: true })).toBeVisible();
});

test("lists only the batches of this product, voided ones marked", async () => {
  const services = createServices();

  const screen = await renderSection(services);

  await expect.element(screen.getByText("15/09/2026")).toBeVisible();
  await expect.element(screen.getByText("12/09/2026")).toBeVisible();
  await expect.element(screen.getByText("Anulada")).toBeVisible();
  expect(screen.getByText("10/09/2026").query()).toBeNull();
  expect(services.fetchAssemblyBatches).toHaveBeenCalledWith(90);
});

test("registers a batch with the same modal as the batches list", async () => {
  const screen = await renderSection(createServices());

  await userEvent.click(screen.getByRole("button", { name: "Registrar producción" }));

  await expect.element(screen.getByRole("dialog")).toBeVisible();
});

test("asks to confirm before cancelling a batch", async () => {
  const services = createServices();
  vi.mocked(services.voidAssemblyBatch).mockResolvedValue({
    kind: "ok",
    batch: { id: mixBatch.id, voidedAt: "2026-09-16T12:00:00.000Z" },
  });
  const screen = await renderSection(services);

  await userEvent.click(
    screen.getByRole("button", { name: "Anular producción de Mix de frutos secos" }),
  );

  expect(services.voidAssemblyBatch).not.toHaveBeenCalled();
  await expect.element(screen.getByRole("dialog")).toBeVisible();
});

test("shows only the recipe to a person without the batches capability, never asking for its batches", async () => {
  const services = createServices();

  const screen = await renderSection(services, { mayManageBatches: false });

  await expect.element(screen.getByText(almendras.name, { exact: true })).toBeVisible();
  expect(screen.getByRole("table", { name: "Producciones" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Registrar producción" }).query()).toBeNull();
  expect(services.fetchAssemblyBatches).not.toHaveBeenCalled();
});

test("titles the batches as the productions of the last 90 days, with a column for each one's actions", async () => {
  const screen = await renderSection(createServices());

  await expect.element(screen.getByText("Producciones de los últimos 90 días")).toBeVisible();
  await expect
    .element(
      screen
        .getByRole("table", { name: "Producciones" })
        .getByRole("columnheader", { name: "Acciones de la producción" }),
    )
    .toBeInTheDocument();
});

test("says there were no productions in the last 90 days when the product has none", async () => {
  const services = createServices();
  vi.mocked(services.fetchAssemblyBatches).mockResolvedValue({
    kind: "ok",
    value: assemblyBatchList([infusionsBatch]),
  });

  const screen = await renderSection(services);

  await expect.element(screen.getByText("Sin producciones en los últimos 90 días")).toBeVisible();
  await expect
    .element(screen.getByText("Cada producción registra lo que se usó y lo que se obtuvo."))
    .toBeVisible();
});

test("says it could not open the productions when they fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchAssemblyBatches).mockResolvedValue({ kind: "failed" });

  const screen = await renderSection(services);

  await expect.element(screen.getByText("No pudimos abrir las producciones")).toBeVisible();
});

test("stacks the productions into a list in a container as narrow as a side panel, with each one's action and values inside it", async () => {
  const screen = await renderSection(createServices(), { width: PANEL_WIDTH });

  const productions = screen.getByRole("list", { name: "Producciones" });
  await expect.element(productions.getByText("15/09/2026")).toBeVisible();
  expect(screen.getByRole("table").query()).toBeNull();
  expect(screen.getByRole("region").query()).toBeNull();
  const first = productions.getByRole("listitem").first().element();
  expect([...first.querySelectorAll("dt")].map((term) => term.textContent)).toEqual([
    "Obtenido",
    "Costo unitario",
    "Vence",
  ]);
  const right = (screen.container.firstElementChild as HTMLElement).getBoundingClientRect().right;
  for (const element of [
    screen.getByRole("button", { name: "Anular producción de Mix de frutos secos" }).element(),
    ...first.querySelectorAll("dd"),
  ]) {
    expect(element.getBoundingClientRect().right).toBeLessThanOrEqual(right);
  }
  await expectNoAccessibilityViolations(screen.container);
});

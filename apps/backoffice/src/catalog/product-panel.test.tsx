import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS, accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { ProductPanel } from "./product-panel";
import { productPanelSections } from "./test-support/product-panel-sections";
import { almonds, honey } from "./test-support/products";

function renderPanel({
  access = ADMINISTRATOR_ACCESS,
  tab,
  assembled = false,
  onClose = () => {},
  onEdit = () => {},
}: {
  access?: BackofficeAccess;
  tab?: string;
  assembled?: boolean;
  onClose?: () => void;
  onEdit?: () => void;
} = {}) {
  return render(
    <ProductPanel
      product={{ ...honey, brandId: "brand-1", tagIds: ["tag-1"], currentUnitPrice: 1500000 }}
      brandName="Colmenares"
      categoryLabel="Almacén"
      tagNames={["Sin TACC"]}
      access={access}
      sections={productPanelSections({ assembledProductIds: assembled ? [honey.id] : [] })}
      tab={tab}
      onEdit={onEdit}
      onClose={onClose}
      onSessionEnded={() => {}}
    />,
  );
}

test("is titled with the product's name and opens on Datos with the product's data", async () => {
  const screen = await renderPanel();

  await expect.element(screen.getByRole("complementary", { name: honey.name })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Datos", selected: true })).toBeVisible();
  await expect.element(screen.getByText("Colmenares")).toBeVisible();
  await expect.element(screen.getByText("Almacén")).toBeVisible();
  await expect.element(screen.getByText("Sin TACC")).toBeVisible();
  await expect.element(screen.getByText(honey.barcodes[0] ?? "")).toBeVisible();
});

test("offers Datos, Precio y costo and Stock y lotes for a simple product, without Receta y tandas", async () => {
  const screen = await renderPanel();

  await expect
    .element(screen.getByRole("tablist", { name: "Secciones del producto" }))
    .toBeVisible();
  const names = ["Datos", "Precio y costo", "Stock y lotes"];
  for (const [index, name] of names.entries()) {
    await expect.element(screen.getByRole("tab").nth(index)).toHaveAccessibleName(name);
  }
  expect(screen.getByRole("tab").elements()).toHaveLength(3);
});

test("adds Receta y tandas as the last tab for an assembled product", async () => {
  const screen = await renderPanel({ assembled: true });

  await expect.element(screen.getByRole("tab", { name: "Receta y tandas" })).toBeVisible();
  expect(screen.getByRole("tab").elements()).toHaveLength(4);
});

test("leaves Receta y tandas out for an assembled product when the person has no recipes capability", async () => {
  const screen = await renderPanel({
    assembled: true,
    access: accessWith("products_and_categories", "prices_area", "stock_balances"),
  });

  await expect.element(screen.getByRole("tab", { name: "Stock y lotes" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Receta y tandas" }).query()).toBeNull();
});

test.each([
  { missing: "prices_area", tab: "Precio y costo" },
  { missing: "stock_balances", tab: "Stock y lotes" },
] as const)("leaves $tab out for a person without $missing", async ({ missing, tab }) => {
  const without = ADMINISTRATOR_ACCESS.capabilities.filter((capability) => capability !== missing);

  const screen = await renderPanel({ access: { ...ADMINISTRATOR_ACCESS, capabilities: without } });

  await expect.element(screen.getByRole("tab", { name: "Datos" })).toBeVisible();
  expect(screen.getByRole("tab", { name: tab }).query()).toBeNull();
});

test("opens on the first tab the person sees when Datos is not theirs", async () => {
  const screen = await renderPanel({ access: accessWith("prices_area") });

  await expect
    .element(screen.getByRole("tab", { name: "Precio y costo", selected: true }))
    .toBeVisible();
  expect(screen.getByRole("tab", { name: "Datos" }).query()).toBeNull();
});

test.each([
  ["price", "Precio y costo", `Precio y costo de ${honey.name}`],
  ["stock", "Stock y lotes", `Stock y lotes de ${honey.name}`],
] as const)("opens the %s tab the address names", async (tab, name, content) => {
  const screen = await renderPanel({ tab });

  await expect.element(screen.getByRole("tab", { name, selected: true })).toBeVisible();
  await expect.element(screen.getByText(content)).toBeVisible();
});

test("opens Receta y tandas and tells the section whether batches may be registered", async () => {
  const screen = await renderPanel({ tab: "recipe", assembled: true });

  await expect
    .element(screen.getByRole("tab", { name: "Receta y tandas", selected: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText(`Receta de ${honey.name}, tandas con registro`))
    .toBeVisible();
});

test("falls back to Datos for a tab the person cannot see", async () => {
  const screen = await renderPanel({ tab: "recipe" });

  await expect.element(screen.getByRole("tab", { name: "Datos", selected: true })).toBeVisible();
});

test("offers Editar in Datos and closes from its close button", async () => {
  const onEdit = vi.fn();
  const onClose = vi.fn();
  const screen = await renderPanel({ onEdit, onClose });

  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  expect(onEdit).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});

test("does not mix up the data of another product", async () => {
  const screen = await render(
    <ProductPanel
      product={almonds}
      brandName={undefined}
      categoryLabel="Frutos secos"
      tagNames={[]}
      access={ADMINISTRATOR_ACCESS}
      sections={productPanelSections()}
      tab={undefined}
      onEdit={() => {}}
      onClose={() => {}}
      onSessionEnded={() => {}}
    />,
  );

  await expect.element(screen.getByRole("complementary", { name: almonds.name })).toBeVisible();
  await expect.element(screen.getByText("Por peso")).toBeVisible();
  await expect.element(screen.getByText("Sin marca")).toBeVisible();
});

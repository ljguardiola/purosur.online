import { beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { StubProductPriceSection } from "../platform/test-support/creation-parts";
import {
  addComponent,
  choose,
  chooseProduct,
  renderNewRecipeModal,
} from "./test-support/new-recipe-modal";
import { avenaConPasas, cajaDeRegalo } from "./test-support/recipes";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({ maySetPrice = true }: { maySetPrice?: boolean } = {}) {
  return renderNewRecipeModal({ productPriceSection: StubProductPriceSection, maySetPrice });
}

test("shows no section before a product and a component are chosen", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("region")).not.toBeInTheDocument();

  await choose(screen, /^Producto armado/, "Avena con pasas");
  await expect.element(dialog.getByRole("region")).not.toBeInTheDocument();
  await userEvent.click(dialog.getByRole("button", { name: "Agregar un componente" }));
  await choose(screen, /^Componente/, "Almendras");

  const section = screen.getByRole("region", { name: "Precio de venta de prueba" });
  await expect.element(section.getByText("Cantidades incompletas")).toBeVisible();
});

test("keeps the section and what it holds while a new component's quantity is still empty", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");
  await chooseProduct(screen, "Avena con pasas");
  await addComponent(screen, "Almendras", "0,4");
  await userEvent.fill(dialog.getByRole("textbox", { name: "Precio de prueba" }), "17000");

  await userEvent.click(dialog.getByRole("button", { name: "Agregar un componente" }));
  await choose(screen, /^Componente/, "Pasas");

  await expect.element(dialog.getByText("Cantidades incompletas")).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: "Precio de prueba" }))
    .toHaveValue("17000");
});

test("hands the section the chosen product and the components typed so far", async () => {
  const screen = await renderModal();
  await choose(screen, /^Producto armado/, "Avena con pasas");
  await addComponent(screen, "Almendras", "0,4");

  const section = screen.getByRole("region", { name: "Precio de venta de prueba" });
  await expect
    .element(
      section.getByText(
        `Producto ${avenaConPasas.id}: Avena con pasas por ${avenaConPasas.saleUnit}`,
      ),
    )
    .toBeVisible();
  await expect.element(section.getByText("Almendras: 400")).toBeVisible();
});

test("tells the section whether the person may set prices", async () => {
  const screen = await renderModal({ maySetPrice: false });
  await choose(screen, /^Producto armado/, "Avena con pasas");
  await addComponent(screen, "Almendras", "0,4");

  await expect
    .element(screen.getByRole("dialog").getByText("No puede fijar el precio"))
    .toBeVisible();
});

test("opens a fresh section for another chosen product", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");
  await chooseProduct(screen, "Avena con pasas");
  await addComponent(screen, "Almendras", "0,4");
  await expect.element(dialog.getByText(`Abierta para ${avenaConPasas.id}`)).toBeVisible();

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Producto armado/ }), "");
  await chooseProduct(screen, "Caja de regalo");

  await expect.element(dialog.getByText(`Abierta para ${cajaDeRegalo.id}`)).toBeVisible();
});

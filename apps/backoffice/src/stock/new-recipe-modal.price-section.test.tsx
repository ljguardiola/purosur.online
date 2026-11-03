import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { StubProductPriceSection } from "../platform/test-support/creation-parts";
import { render } from "../shell/test-support/render-with-router";
import { NewRecipeModal } from "./new-recipe-modal";
import { avenaConPasas, mixDeFrutosSecos, recipeProducts } from "./test-support/recipes";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({ maySetPrice = true }: { maySetPrice?: boolean } = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <NewRecipeModal
          open
          products={recipeProducts}
          recipes={[mixDeFrutosSecos]}
          productPriceSection={StubProductPriceSection}
          maySetPrice={maySetPrice}
          services={{ saveRecipe: vi.fn() }}
          onSaved={() => {}}
          onClose={() => {}}
          onSessionEnded={() => {}}
        />
      </main>
    </FieldSizeProvider>,
  );
}

async function choose(
  screen: Awaited<ReturnType<typeof renderModal>>,
  combobox: RegExp,
  name: string,
) {
  await userEvent.click(screen.getByRole("dialog").getByRole("combobox", { name: combobox }));
  await expect.element(screen.getByRole("option", { name })).toBeVisible();
  (screen.getByRole("option", { name }).element() as HTMLElement).click();
}

async function addComponent(
  screen: Awaited<ReturnType<typeof renderModal>>,
  name: string,
  quantity: string,
) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Agregar un componente" }));
  await choose(screen, /^Componente/, name);
  await userEvent.fill(dialog.getByRole("textbox", { name: `Cantidad de ${name}` }), quantity);
}

test("shows no section before a product and a valid component are chosen", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("region")).not.toBeInTheDocument();

  await choose(screen, /^Producto armado/, "Avena con pasas");
  await expect.element(dialog.getByRole("region")).not.toBeInTheDocument();
  await userEvent.click(dialog.getByRole("button", { name: "Agregar un componente" }));
  await choose(screen, /^Componente/, "Almendras");

  await expect.element(dialog.getByRole("region")).not.toBeInTheDocument();
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

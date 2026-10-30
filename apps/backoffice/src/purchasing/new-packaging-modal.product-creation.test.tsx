import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { ProductCreationModal } from "../platform/creation-parts";
import { StubProductCreationModal } from "../platform/test-support/creation-parts";
import { render } from "../shell/test-support/render-with-router";
import { NewPackagingModal } from "./new-packaging-modal";
import { packagableProducts } from "./test-support/packagings";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal(
  productCreationModal?: ProductCreationModal,
  products: typeof packagableProducts = packagableProducts,
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <NewPackagingModal
          open
          products={products}
          {...(productCreationModal ? { productCreationModal } : {})}
          services={{ createPackaging: vi.fn() }}
          onCreated={() => {}}
          onClose={() => {}}
          onSessionEnded={() => {}}
        />
      </main>
    </FieldSizeProvider>,
  );
}

test("typing a product that does not exist offers to create it, opening the product form with the typed text", async () => {
  const screen = await renderModal(StubProductCreationModal);

  await userEvent.fill(
    screen.getByRole("dialog", { name: "Nueva presentación" }).getByRole("combobox", {
      name: /^Producto/,
    }),
    "Yerba mate",
  );
  await userEvent.click(page.getByRole("option", { name: "Crear producto «Yerba mate»" }));

  await expect
    .element(
      screen
        .getByRole("dialog", { name: "Nuevo producto" })
        .getByText("Nombre tipeado: Yerba mate"),
    )
    .toBeVisible();
});

test("saving the created product selects it and keeps the name typed for the packaging", async () => {
  const screen = await renderModal(StubProductCreationModal);
  const dialog = screen.getByRole("dialog", { name: "Nueva presentación" });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Caja x 6");
  await userEvent.fill(dialog.getByRole("combobox", { name: /^Producto/ }), "Yerba mate");
  await userEvent.click(page.getByRole("option", { name: "Crear producto «Yerba mate»" }));

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Nuevo producto" })
      .getByRole("button", { name: "Guardar lo creado" }),
  );

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Nuevo producto" }).query())
    .toBeNull();
  await expect
    .element(dialog.getByRole("combobox", { name: /^Producto/ }))
    .toHaveValue("Yerba mate");
  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("Caja x 6");
});

test("offers no product creation when the modal is given no way to create one", async () => {
  const screen = await renderModal();

  await userEvent.fill(
    screen.getByRole("dialog").getByRole("combobox", { name: /^Producto/ }),
    "Yerba mate",
  );

  await expect.element(page.getByText("Sin resultados")).toBeVisible();
  expect(page.getByRole("option", { name: /^Crear producto/ }).query()).toBeNull();
});

test("with no products at all, still offers creating the first one, selects it once saved and allows creating the packaging", async () => {
  const screen = await renderModal(StubProductCreationModal, []);
  const dialog = screen.getByRole("dialog", { name: "Nueva presentación" });
  await expect.element(dialog.getByRole("combobox", { name: /^Producto/ })).toBeVisible();

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Producto/ }), "Yerba mate");
  await userEvent.click(page.getByRole("option", { name: "Crear producto «Yerba mate»" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Nuevo producto" })
      .getByRole("button", { name: "Guardar lo creado" }),
  );

  await expect
    .element(dialog.getByRole("combobox", { name: /^Producto/ }))
    .toHaveValue("Yerba mate");
  await expect.element(dialog.getByRole("button", { name: "Crear la presentación" })).toBeEnabled();
});

test("with no products at all and no way to create one, shows the empty state and cannot create", async () => {
  const screen = await renderModal(undefined, []);
  const dialog = screen.getByRole("dialog", { name: "Nueva presentación" });

  await expect.element(dialog.getByText("No hay productos activos")).toBeVisible();
  await expect
    .element(dialog.getByRole("button", { name: "Crear la presentación" }))
    .toBeDisabled();
});

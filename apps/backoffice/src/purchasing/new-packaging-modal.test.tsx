import type { PackagingList, PackagingSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { NewPackagingModal, type NewPackagingModalServices } from "./new-packaging-modal";
import { bolsaDeAvena, cajaDeMiel, packagableProducts } from "./test-support/packagings";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  createPackaging = vi.fn<NewPackagingModalServices["createPackaging"]>(),
  products = packagableProducts,
  onCreated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  createPackaging?: NewPackagingModalServices["createPackaging"];
  products?: PackagingList["products"];
  onCreated?: (packaging: PackagingSummary) => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <NewPackagingModal
          open
          products={products}
          services={{ createPackaging }}
          onCreated={onCreated}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

async function chooseProduct(screen: ModalScreen, name: string) {
  await userEvent.click(screen.getByRole("dialog").getByRole("combobox", { name: /^Producto/ }));
  await userEvent.click(screen.getByRole("option", { name }));
}

async function fill(screen: ModalScreen, fields: { name?: string; quantity?: string }) {
  const dialog = screen.getByRole("dialog");
  if (fields.name !== undefined) {
    await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), fields.name);
  }
  if (fields.quantity !== undefined) {
    await userEvent.fill(
      dialog.getByRole("textbox", { name: /^Cantidad por presentación/ }),
      fields.quantity,
    );
  }
  return dialog;
}

async function submit(screen: ModalScreen) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la presentación" }));
  return dialog;
}

test("shows the eyebrow, the title and the product, name and quantity fields", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("Stock · Presentaciones de compra")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Nueva presentación" })).toBeVisible();
  await expect.element(dialog.getByRole("combobox", { name: /^Producto/ })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Cantidad por presentación/ }))
    .toBeVisible();
});

test("the quantity's unit follows the chosen product", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await expect.element(dialog.getByText("u", { exact: true })).toBeVisible();

  await chooseProduct(screen, "Avena arrollada");
  await expect.element(dialog.getByText("kg", { exact: true })).toBeVisible();
});

test("the product list is searched by typing", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Producto/ }), "avena");

  await expect.element(screen.getByRole("option", { name: "Avena arrollada" })).toBeVisible();
  expect(screen.getByRole("option", { name: "Almendras peladas" }).query()).toBeNull();
});

test("creates a packaging of a unit product, with whole units sent as thousandths", async () => {
  const createPackaging = vi
    .fn<NewPackagingModalServices["createPackaging"]>()
    .mockResolvedValue({ kind: "ok", packaging: cajaDeMiel });
  const onCreated = vi.fn();
  const screen = await renderModal({ createPackaging, onCreated });

  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await fill(screen, { name: " Caja x 12 ", quantity: "12" });
  await submit(screen);

  expect(createPackaging).toHaveBeenCalledWith({
    productId: cajaDeMiel.productId,
    name: "Caja x 12",
    quantityPerPackage: 12_000,
  });
  await expect.poll(() => onCreated.mock.calls).toEqual([[cajaDeMiel]]);
});

test("creates a packaging of a product sold by weight, with kilos up to three decimals", async () => {
  const createPackaging = vi
    .fn<NewPackagingModalServices["createPackaging"]>()
    .mockResolvedValue({ kind: "ok", packaging: bolsaDeAvena });
  const screen = await renderModal({ createPackaging });

  await chooseProduct(screen, "Avena arrollada");
  await fill(screen, { name: "Bolsa de 2,5 kg", quantity: "2,5" });
  await submit(screen);

  expect(createPackaging).toHaveBeenCalledWith({
    productId: bolsaDeAvena.productId,
    name: "Bolsa de 2,5 kg",
    quantityPerPackage: 2500,
  });
});

test("refuses a missing product, name and quantity without calling the API", async () => {
  const createPackaging = vi.fn<NewPackagingModalServices["createPackaging"]>();
  const screen = await renderModal({ createPackaging });

  const dialog = await submit(screen);

  await expect.element(dialog.getByText("Elegí el producto.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá el nombre de la presentación.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá la cantidad por presentación.")).toBeVisible();
  expect(createPackaging).not.toHaveBeenCalled();
});

test("refuses a part of a unit for a unit product, saying how to type it", async () => {
  const createPackaging = vi.fn<NewPackagingModalServices["createPackaging"]>();
  const screen = await renderModal({ createPackaging });
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await fill(screen, { name: "Caja", quantity: "12,5" });

  const dialog = await submit(screen);

  await expect
    .element(dialog.getByText("Escribí una cantidad entera de unidades, por ejemplo 16."))
    .toBeVisible();
  expect(createPackaging).not.toHaveBeenCalled();
});

test("shows a name the product already has under the name field", async () => {
  const createPackaging = vi
    .fn<NewPackagingModalServices["createPackaging"]>()
    .mockResolvedValue({ kind: "name_taken" });
  const screen = await renderModal({ createPackaging });
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await fill(screen, { name: "Caja x 12", quantity: "12" });

  const dialog = await submit(screen);

  await expect
    .element(dialog.getByText("Este producto ya tiene una presentación con ese nombre."))
    .toBeVisible();
});

test("shows a quantity the cloud refused under the quantity field", async () => {
  const createPackaging = vi
    .fn<NewPackagingModalServices["createPackaging"]>()
    .mockResolvedValue({ kind: "validation_failed", field: "quantityPerPackage" });
  const screen = await renderModal({ createPackaging });
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await fill(screen, { name: "Caja x 12", quantity: "12" });

  const dialog = await submit(screen);

  await expect
    .element(dialog.getByText("Escribí una cantidad entera de unidades, por ejemplo 16."))
    .toBeVisible();
});

test("shows a product that is no longer available under the product field", async () => {
  const createPackaging = vi
    .fn<NewPackagingModalServices["createPackaging"]>()
    .mockResolvedValue({ kind: "product_not_found" });
  const screen = await renderModal({ createPackaging });
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await fill(screen, { name: "Caja x 12", quantity: "12" });

  const dialog = await submit(screen);

  await expect
    .element(dialog.getByText("Este producto ya no está disponible. Elegí otro."))
    .toBeVisible();
});

test("shows the failure notice", async () => {
  const createPackaging = vi
    .fn<NewPackagingModalServices["createPackaging"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ createPackaging });
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await fill(screen, { name: "Caja x 12", quantity: "12" });

  const dialog = await submit(screen);

  await expect.element(dialog.getByText("No se guardó la presentación")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const createPackaging = vi.fn<NewPackagingModalServices["createPackaging"]>().mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderModal({ createPackaging });
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await fill(screen, { name: "Caja x 12", quantity: "12" });

  const dialog = await submit(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("ends the session when saving finds no open session", async () => {
  const createPackaging = vi
    .fn<NewPackagingModalServices["createPackaging"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ createPackaging, onSessionEnded });
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await fill(screen, { name: "Caja x 12", quantity: "12" });

  await submit(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when saving comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchase-packagings");
  const createPackaging = vi
    .fn<NewPackagingModalServices["createPackaging"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ createPackaging });
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await fill(screen, { name: "Caja x 12", quantity: "12" });

  await submit(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("cancel closes the modal without calling the API", async () => {
  const createPackaging = vi.fn<NewPackagingModalServices["createPackaging"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ createPackaging, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(createPackaging).not.toHaveBeenCalled();
});

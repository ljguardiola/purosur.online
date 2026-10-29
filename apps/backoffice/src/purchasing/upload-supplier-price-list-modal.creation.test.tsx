import type { SupplierSummary } from "@purosur/contracts";
import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { suppliersWithCuits } from "./test-support/suppliers";
import {
  UploadSupplierPriceListModal,
  type UploadSupplierPriceListModalServices,
} from "./upload-supplier-price-list-modal";

const { andina, granos } = suppliersWithCuits(FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT);

const distribuidoraSur: SupplierSummary = {
  ...granos,
  id: "5a900000-0000-4000-8000-000000000010",
  name: "Distribuidora Sur",
};

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(): UploadSupplierPriceListModalServices {
  return {
    fetchSuppliers: vi
      .fn<UploadSupplierPriceListModalServices["fetchSuppliers"]>()
      .mockResolvedValue({ kind: "ok", value: [granos, andina] }),
    uploadSupplierPriceList: vi.fn(),
    loadSupplierPriceListWebPage: vi.fn(),
    createSupplier: vi.fn(),
  };
}

async function renderModal(
  services: UploadSupplierPriceListModalServices,
  mayCreateSupplier: boolean,
) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <UploadSupplierPriceListModal
          open
          initialSupplierId={null}
          mayCreateSupplier={mayCreateSupplier}
          services={services}
          onUploaded={() => {}}
          onClose={() => {}}
          onSessionEnded={() => {}}
        />
      </main>
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Cargar una lista" });
  await expect.element(dialog.getByRole("combobox", { name: /^Proveedor/ })).toBeVisible();
  return { screen, dialog };
}

test("typing a supplier that does not exist offers to create it, opening the supplier modal with the typed name", async () => {
  const { screen, dialog } = await renderModal(createServices(), true);

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Proveedor/ }), "Distribuidora Sur");
  await userEvent.click(
    screen.getByRole("option", { name: "Crear proveedor «Distribuidora Sur»" }),
  );

  await expect
    .element(
      screen
        .getByRole("dialog", { name: "Nuevo proveedor" })
        .getByRole("textbox", { name: /^Nombre/ }),
    )
    .toHaveValue("Distribuidora Sur");
});

test("saving the stacked supplier selects it", async () => {
  const services = createServices();
  vi.mocked(services.createSupplier).mockResolvedValue({ kind: "ok", supplier: distribuidoraSur });
  const { screen, dialog } = await renderModal(services, true);
  await userEvent.fill(dialog.getByRole("combobox", { name: /^Proveedor/ }), "Distribuidora Sur");
  await userEvent.click(
    screen.getByRole("option", { name: "Crear proveedor «Distribuidora Sur»" }),
  );

  await userEvent.click(
    screen.getByRole("dialog", { name: "Nuevo proveedor" }).getByRole("button", {
      name: "Crear el proveedor",
    }),
  );

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Nuevo proveedor" }).query())
    .toBeNull();
  await expect
    .element(dialog.getByRole("combobox", { name: /^Proveedor/ }))
    .toHaveValue("Distribuidora Sur");
});

test("offers no supplier creation when the person cannot manage suppliers", async () => {
  const { screen, dialog } = await renderModal(createServices(), false);

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Proveedor/ }), "Distribuidora Sur");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
  expect(screen.getByRole("option", { name: /^Crear proveedor/ }).query()).toBeNull();
});

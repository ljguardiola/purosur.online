import type { PackagingSummary, SupplierSummary } from "@purosur/contracts";
import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS, accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { NewPurchaseScreen } from "./new-purchase-screen";
import type { NewPurchaseScreenServices } from "./new-purchase-services";
import { cajaDeMiel } from "./test-support/packagings";
import { purchaseChoicesFrom } from "./test-support/purchases";
import { suppliersWithCuits } from "./test-support/suppliers";

const { andina, granos } = suppliersWithCuits(FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT);

const distribuidoraSur: SupplierSummary = {
  ...granos,
  id: "5a900000-0000-4000-8000-000000000010",
  name: "Distribuidora Sur",
};

const cajaX6: PackagingSummary = {
  ...cajaDeMiel,
  id: "9ac00000-0000-4000-8000-000000000010",
  name: "Caja x 6",
  quantityPerPackage: 6000,
};

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(): NewPurchaseScreenServices {
  return {
    fetchPurchaseChoices: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: purchaseChoicesFrom([andina, granos]) }),
    registerPurchase: vi.fn(),
    createSupplier: vi.fn(),
    createPackaging: vi.fn(),
  };
}

async function opened(services: NewPurchaseScreenServices, access: BackofficeAccess) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <NewPurchaseScreen access={access} services={services} onSessionEnded={() => {}} />
      </main>
    </FieldSizeProvider>,
  );
  await expect.element(screen.getByRole("combobox", { name: /^Proveedor/ })).toBeVisible();
  return screen;
}

type Screen = Awaited<ReturnType<typeof opened>>;

async function typeSupplier(screen: Screen, text: string) {
  await userEvent.fill(screen.getByRole("combobox", { name: /^Proveedor/ }), text);
}

async function openPackagingSelectorOfFirstLine(screen: Screen) {
  const group = screen.getByRole("group", { name: "Línea 1" });
  await userEvent.click(group.getByRole("combobox", { name: /^Producto/ }));
  (page.getByRole("option", { name: "Miel pura de abeja 1 kg" }).element() as HTMLElement).click();
  await userEvent.click(group.getByText("Presentación", { exact: true }).last());
  return group;
}

test("typing a supplier that does not exist offers to create it, opening the supplier modal with the typed name", async () => {
  const screen = await opened(createServices(), ADMINISTRATOR_ACCESS);

  await typeSupplier(screen, "Distribuidora Sur");
  await userEvent.click(
    screen.getByRole("option", { name: "Crear proveedor «Distribuidora Sur»" }),
  );

  const supplierDialog = screen.getByRole("dialog", { name: "Nuevo proveedor" });
  await expect
    .element(supplierDialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Distribuidora Sur");
});

test("saving the stacked supplier selects it and keeps the rest of the purchase as typed", async () => {
  const services = createServices();
  vi.mocked(services.createSupplier).mockResolvedValue({ kind: "ok", supplier: distribuidoraSur });
  const screen = await opened(services, ADMINISTRATOR_ACCESS);
  await userEvent.fill(screen.getByRole("textbox", { name: /^Nota/ }), "Entrega de la tarde");
  await typeSupplier(screen, "Distribuidora Sur");
  await userEvent.click(
    screen.getByRole("option", { name: "Crear proveedor «Distribuidora Sur»" }),
  );
  const supplierDialog = screen.getByRole("dialog", { name: "Nuevo proveedor" });

  await userEvent.click(supplierDialog.getByRole("button", { name: "Crear el proveedor" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Nuevo proveedor" }).query())
    .toBeNull();
  await expect
    .element(screen.getByRole("combobox", { name: /^Proveedor/ }))
    .toHaveValue("Distribuidora Sur");
  await expect
    .element(screen.getByRole("textbox", { name: /^Nota/ }))
    .toHaveValue("Entrega de la tarde");
});

test("offers no supplier creation to a person who cannot manage suppliers", async () => {
  const screen = await opened(createServices(), accessWith("purchases", "stock_area"));

  await typeSupplier(screen, "Distribuidora Sur");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
  expect(screen.getByRole("option", { name: /^Crear proveedor/ }).query()).toBeNull();
});

test("typing a packaging that does not exist offers to create it for the line's product with the typed name", async () => {
  const screen = await opened(createServices(), ADMINISTRATOR_ACCESS);
  const group = await openPackagingSelectorOfFirstLine(screen);

  await userEvent.fill(group.getByRole("combobox", { name: /^Presentación/ }), "Caja x 6");
  await userEvent.click(screen.getByRole("option", { name: "Crear presentación «Caja x 6»" }));

  const packagingDialog = screen.getByRole("dialog", { name: "Nueva presentación" });
  await expect
    .element(packagingDialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Caja x 6");
  await expect
    .element(packagingDialog.getByText("Producto: Miel pura de abeja 1 kg"))
    .toBeVisible();
});

test("saving the stacked packaging selects it in that line", async () => {
  const services = createServices();
  vi.mocked(services.createPackaging).mockResolvedValue({ kind: "ok", packaging: cajaX6 });
  const screen = await opened(services, ADMINISTRATOR_ACCESS);
  const group = await openPackagingSelectorOfFirstLine(screen);
  await userEvent.fill(group.getByRole("combobox", { name: /^Presentación/ }), "Caja x 6");
  await userEvent.click(screen.getByRole("option", { name: "Crear presentación «Caja x 6»" }));
  const packagingDialog = screen.getByRole("dialog", { name: "Nueva presentación" });
  await userEvent.fill(
    packagingDialog.getByRole("textbox", { name: /^Cantidad por presentación/ }),
    "6",
  );

  await userEvent.click(packagingDialog.getByRole("button", { name: "Crear la presentación" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Nueva presentación" }).query())
    .toBeNull();
  await expect
    .element(group.getByRole("combobox", { name: /^Presentación/ }))
    .toHaveValue("Caja x 6 (6 u)");
});

test("offers no packaging creation to a person who cannot manage purchase packagings", async () => {
  const screen = await opened(createServices(), accessWith("purchases", "suppliers"));
  const group = await openPackagingSelectorOfFirstLine(screen);

  await userEvent.fill(group.getByRole("combobox", { name: /^Presentación/ }), "Caja x 6");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
  expect(screen.getByRole("option", { name: /^Crear presentación/ }).query()).toBeNull();
});

import type {
  CategorySummary,
  DiscountSummary,
  ProductSummary,
  TagSummary,
} from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { NewDiscountModal, type NewDiscountModalServices } from "./new-discount-modal";
import {
  chooseTarget,
  fillNewDiscountExceptTarget,
  fillValidNewDiscount,
  radioLabel,
  typeDate,
} from "./test-support/discount-modal";
import {
  almacenCategory,
  almondsProduct,
  retiredProduct,
  retiredTag,
  sinTaccTag,
  veganoTag,
  yerbaOff,
  yerbaProduct,
  yerbasCategory,
} from "./test-support/discounts";

// A modal panel is centered by a fixed-position overlay that never grows the document's scroll
// area, so a control past its clipped edge can't be scrolled into view at the default viewport.
beforeEach(async () => {
  await page.viewport(1280, 1100);
});

function createServices(
  overrides: Partial<NewDiscountModalServices> = {},
): NewDiscountModalServices {
  return { createDiscount: vi.fn(), ...overrides };
}

type ModalOptions = {
  products?: ProductSummary[];
  categories?: CategorySummary[];
  tags?: TagSummary[];
  onClose?: () => void;
  onCreated?: (discount: DiscountSummary) => void;
  onSessionEnded?: () => void;
};

function modalElement(open: boolean, services: NewDiscountModalServices, options: ModalOptions) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <NewDiscountModal
          open={open}
          onClose={options.onClose ?? (() => {})}
          onCreated={options.onCreated ?? (() => {})}
          onSessionEnded={options.onSessionEnded ?? (() => {})}
          products={options.products ?? [yerbaProduct, almondsProduct, retiredProduct]}
          categories={options.categories ?? [almacenCategory, yerbasCategory]}
          tags={options.tags ?? [sinTaccTag, veganoTag, retiredTag]}
          services={services}
        />
      </main>
    </FieldSizeProvider>
  );
}

async function renderModal(services: NewDiscountModalServices, options: ModalOptions = {}) {
  const screen = await render(modalElement(true, services, options));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Nueva promoción" })).toBeVisible();
  return {
    screen,
    dialog,
    rerender: (open: boolean) => screen.rerender(modalElement(open, services, options)),
  };
}

test("shows the header, the percentage kind chosen and every field of a new promotion", async () => {
  const { dialog } = await renderModal(createServices());

  await expect.element(dialog.getByText("Catálogo", { exact: true })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toBeVisible();
  await expect
    .element(dialog.getByRole("radio", { name: "Porcentaje de descuento" }))
    .toBeChecked();
  await expect
    .element(dialog.getByText("Sobre un producto, una categoría o un distintivo"))
    .toBeVisible();
  await expect.element(dialog.getByText("Se aplica sobre")).toBeVisible();
  await expect.element(dialog.getByRole("radio", { name: "Producto" })).toBeChecked();
  await expect.element(dialog.getByRole("button", { name: /^Elegí un producto/ })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Descuento/ })).toBeVisible();
  await expect.element(dialog.getByText("%", { exact: true })).toBeVisible();
  await expect.element(dialog.getByRole("group", { name: /^Desde/ })).toBeVisible();
  await expect.element(dialog.getByRole("group", { name: /^Hasta/ })).toBeVisible();
  await expect.element(dialog.getByText("Días de la semana")).toBeVisible();
  await expect
    .element(dialog.getByText("Sin ningún día marcado, vale todos los días."))
    .toBeVisible();
  await expect
    .element(
      dialog
        .getByText(
          "Una línea de la venta lleva una sola promoción: las promociones no se acumulan entre sí.",
        )
        .first(),
    )
    .toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Crear la promoción" })).toBeVisible();
});

test("has no switch, since a new promotion is created active", async () => {
  const { dialog } = await renderModal(createServices());

  expect(dialog.getByRole("switch").query()).toBeNull();
});

test("creates a promotion with the request the cloud reads and reports the created one", async () => {
  const services = createServices();
  vi.mocked(services.createDiscount).mockResolvedValue({ kind: "ok", discount: yerbaOff });
  const onCreated = vi.fn();
  const { dialog } = await renderModal(services, { onCreated });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "  Yerba de septiembre ");
  await chooseTarget(dialog, "Elegí un producto", "Yerba Playadito 1 kg");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Descuento/ }), "15");
  await typeDate(dialog, "Desde", "12092026");
  await typeDate(dialog, "Hasta", "30092026");
  await userEvent.click(dialog.getByRole("button", { name: "Lunes" }));
  await userEvent.click(dialog.getByRole("button", { name: "Miércoles" }));
  await userEvent.click(dialog.getByRole("button", { name: "Crear la promoción" }));

  await expect.poll(() => vi.mocked(services.createDiscount).mock.calls.length).toBe(1);
  expect(services.createDiscount).toHaveBeenCalledWith({
    name: "Yerba de septiembre",
    benefit: { kind: "PERCENT_OFF", percent: 15 },
    target: { kind: "PRODUCT", id: yerbaProduct.id },
    validFrom: "2026-09-12",
    validTo: "2026-09-30",
    weekdays: [1, 3],
  });
  await expect.poll(() => onCreated.mock.calls.length).toBe(1);
  expect(onCreated).toHaveBeenCalledWith(yerbaOff);
});

test("sends no weekday when none is marked", async () => {
  const services = createServices();
  vi.mocked(services.createDiscount).mockResolvedValue({ kind: "ok", discount: yerbaOff });
  const { dialog } = await renderModal(services);
  await fillValidNewDiscount(dialog);

  await userEvent.click(dialog.getByRole("button", { name: "Crear la promoción" }));

  await expect.poll(() => vi.mocked(services.createDiscount).mock.calls.length).toBe(1);
  expect(vi.mocked(services.createDiscount).mock.calls[0]?.[0].weekdays).toEqual([]);
});

test("offers the active products by name, without the ones taken out of sale", async () => {
  const { dialog } = await renderModal(createServices());

  await userEvent.click(dialog.getByRole("button", { name: /^Elegí un producto/ }));

  expect(
    dialog
      .getByRole("option")
      .all()
      .map((option) => option.element().textContent),
  ).toEqual(["Almendras peladas", "Yerba Playadito 1 kg"]);
});

test("switching what it applies to changes the picker's label, options and placeholder, and clears the target", async () => {
  const { dialog } = await renderModal(createServices());
  await chooseTarget(dialog, "Elegí un producto", "Yerba Playadito 1 kg");

  await userEvent.click(radioLabel(dialog, "Categoría"));

  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  expect(
    dialog
      .getByRole("option")
      .all()
      .map((option) => option.element().textContent),
  ).toEqual(["Almacén", "Almacén › Yerbas"]);
  await userEvent.click(dialog.getByRole("option", { name: "Almacén › Yerbas" }));

  await userEvent.click(radioLabel(dialog, "Distintivo"));

  await expect.element(dialog.getByRole("button", { name: /^Elegí un distintivo/ })).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí un distintivo/ }));
  expect(
    dialog
      .getByRole("option")
      .all()
      .map((option) => option.element().textContent),
  ).toEqual(["Sin TACC", "Vegano"]);
});

test("creates a promotion on a category or on a tag", async () => {
  const services = createServices();
  vi.mocked(services.createDiscount).mockResolvedValue({ kind: "ok", discount: yerbaOff });
  const { dialog } = await renderModal(services);
  await fillValidNewDiscount(dialog);
  await userEvent.click(radioLabel(dialog, "Distintivo"));
  await chooseTarget(dialog, "Elegí un distintivo", "Vegano");

  await userEvent.click(dialog.getByRole("button", { name: "Crear la promoción" }));

  await expect.poll(() => vi.mocked(services.createDiscount).mock.calls.length).toBe(1);
  expect(vi.mocked(services.createDiscount).mock.calls[0]?.[0].target).toEqual({
    kind: "TAG",
    id: veganoTag.id,
  });
});

test("an empty submit shows each field's message and never calls the cloud", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Crear la promoción" }));

  await expect.element(dialog.getByText("Ingresá el nombre de la promoción.")).toBeVisible();
  await expect.element(dialog.getByText("Elegí un producto.")).toBeVisible();
  await expect
    .element(dialog.getByText("Ingresá un porcentaje entero entre 1 y 99."))
    .toBeVisible();
  await expect.element(dialog.getByText("Ingresá la fecha de inicio.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá la fecha de fin.")).toBeVisible();
  expect(services.createDiscount).not.toHaveBeenCalled();
});

test("asks for a whole percentage between 1 and 99 whatever was typed", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);
  await fillValidNewDiscount(dialog);

  for (const typed of ["0", "100", "12,5", "mucho"]) {
    await userEvent.fill(dialog.getByRole("textbox", { name: /^Descuento/ }), typed);
    await userEvent.click(dialog.getByRole("button", { name: "Crear la promoción" }));
    await expect
      .element(dialog.getByText("Ingresá un porcentaje entero entre 1 y 99."))
      .toBeVisible();
  }
  expect(services.createDiscount).not.toHaveBeenCalled();
});

test("refuses an end date before the start date, on the end date", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);
  await fillValidNewDiscount(dialog);
  await typeDate(dialog, "Hasta", "01092026");

  await userEvent.click(dialog.getByRole("button", { name: "Crear la promoción" }));

  await expect
    .element(dialog.getByText("La fecha de fin no puede ser anterior a la de inicio."))
    .toBeVisible();
  expect(services.createDiscount).not.toHaveBeenCalled();
});

test("puts the message the cloud names on that field", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);
  await fillValidNewDiscount(dialog);
  vi.mocked(services.createDiscount).mockResolvedValue({
    kind: "validation_failed",
    field: "benefit",
  });

  await userEvent.click(dialog.getByRole("button", { name: "Crear la promoción" }));

  await expect
    .element(dialog.getByText("Ingresá un porcentaje entero entre 1 y 99."))
    .toBeVisible();
});

test.each([
  [
    "PRODUCT",
    "Elegí un producto",
    "Yerba Playadito 1 kg",
    "Ya no está disponible. Elegí otro producto.",
  ],
  ["CATEGORY", "Elegí una categoría", "Almacén", "Ya no está disponible. Elegí otra categoría."],
  ["TAG", "Elegí un distintivo", "Vegano", "Ya no está disponible. Elegí otro distintivo."],
] as const)(
  "says a %s that is gone is unavailable, on the picker",
  async (kind, placeholder, option, message) => {
    const services = createServices();
    vi.mocked(services.createDiscount).mockResolvedValue({ kind: "target_not_found" });
    const { dialog } = await renderModal(services);
    await fillNewDiscountExceptTarget(dialog);
    const labels = { PRODUCT: "Producto", CATEGORY: "Categoría", TAG: "Distintivo" };
    await userEvent.click(radioLabel(dialog, labels[kind]));
    await chooseTarget(dialog, placeholder, option);

    await userEvent.click(dialog.getByRole("button", { name: "Crear la promoción" }));

    await expect.element(dialog.getByText(message)).toBeVisible();
  },
);

test("the target message clears once another one is chosen", async () => {
  const services = createServices();
  vi.mocked(services.createDiscount).mockResolvedValue({ kind: "target_not_found" });
  const { dialog } = await renderModal(services);
  await fillValidNewDiscount(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "Crear la promoción" }));
  await expect
    .element(dialog.getByText("Ya no está disponible. Elegí otro producto."))
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: /Yerba Playadito 1 kg/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almendras peladas" }));

  expect(dialog.getByText("Ya no está disponible. Elegí otro producto.").query()).toBeNull();
});

test("ends the session when the cloud finds none open", async () => {
  const services = createServices();
  vi.mocked(services.createDiscount).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });
  await fillValidNewDiscount(dialog);

  await userEvent.click(dialog.getByRole("button", { name: "Crear la promoción" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("sends the user to Mi cuenta when the cloud refuses the permission", async () => {
  window.history.pushState(null, "", "/catalog/discounts");
  const services = createServices();
  vi.mocked(services.createDiscount).mockResolvedValue({ kind: "forbidden" });
  const { dialog } = await renderModal(services);
  await fillValidNewDiscount(dialog);

  await userEvent.click(dialog.getByRole("button", { name: "Crear la promoción" }));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("shows the rate-limited notice with the time to wait", async () => {
  const services = createServices();
  vi.mocked(services.createDiscount).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal(services);
  await fillValidNewDiscount(dialog);

  await userEvent.click(dialog.getByRole("button", { name: "Crear la promoción" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows a failure notice and keeps what was typed when the attempt fails", async () => {
  const services = createServices();
  vi.mocked(services.createDiscount).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);
  await fillValidNewDiscount(dialog);

  await userEvent.click(dialog.getByRole("button", { name: "Crear la promoción" }));

  await expect.element(dialog.getByText("No se guardó la promoción")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Yerba de septiembre");
});

test("cancel closes the modal", async () => {
  const onClose = vi.fn();
  const { dialog } = await renderModal(createServices(), { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
});

test("reopening the modal starts from empty fields", async () => {
  const { dialog, rerender } = await renderModal(createServices());
  await fillValidNewDiscount(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "Lunes" }));

  await rerender(false);
  await rerender(true);

  const reopened = page.getByRole("dialog");
  await expect.element(reopened.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("");
  await expect.element(reopened.getByRole("textbox", { name: /^Descuento/ })).toHaveValue("");
  await expect.element(reopened.getByRole("button", { name: /^Elegí un producto/ })).toBeVisible();
  await expect
    .element(reopened.getByRole("button", { name: "Lunes" }))
    .toHaveAttribute("aria-pressed", "false");
});

test("has no accessibility violations", async () => {
  const { dialog } = await renderModal(createServices());

  await expectNoAccessibilityViolations(dialog.element());
});

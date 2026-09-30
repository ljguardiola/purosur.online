import type { DiscountSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { EditDiscountModal, type EditDiscountModalServices } from "./edit-discount-modal";
import type { DiscountReload } from "./pricing-queries";
import {
  chooseBuyNPayM,
  chooseTarget,
  dateSegments,
  fillQuantities,
  radioLabel,
  typeDate,
} from "./test-support/discount-modal";
import {
  almacenCategory,
  almacenTuesdays,
  almondsProduct,
  almondsThreeForTwo,
  discountTargets,
  retiredProduct,
  retiredTag,
  sinTaccWinter,
  switchedOffPromotion,
  yerbaOff,
  yerbaProduct,
  yerbasCategory,
  yerbaThreeForTwo,
} from "./test-support/discounts";

beforeEach(async () => {
  await page.viewport(1280, 1200);
});

function createServices(
  overrides: Partial<EditDiscountModalServices> = {},
): EditDiscountModalServices {
  return { editDiscount: vi.fn(), ...overrides };
}

type ModalOptions = {
  target?: DiscountSummary | null;
  reload?: (id: string) => Promise<DiscountReload>;
  onClose?: () => void;
  onSaved?: (discount: DiscountSummary) => void;
  onSessionEnded?: () => void;
};

function modalElement(services: EditDiscountModalServices, options: ModalOptions) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <EditDiscountModal
          target={options.target === undefined ? yerbaOff : options.target}
          onClose={options.onClose ?? (() => {})}
          onSaved={options.onSaved ?? (() => {})}
          onSessionEnded={options.onSessionEnded ?? (() => {})}
          reload={options.reload ?? (() => Promise.resolve({ kind: "list_failed" }))}
          targets={discountTargets}
          services={services}
        />
      </main>
    </FieldSizeProvider>
  );
}

async function renderModal(services: EditDiscountModalServices, options: ModalOptions = {}) {
  const screen = await render(modalElement(services, options));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading")).toBeVisible();
  return {
    screen,
    dialog,
    rerender: (next: ModalOptions) => screen.rerender(modalElement(services, next)),
  };
}

test("shows the header with the promotion's name, and its values filled in", async () => {
  const { dialog } = await renderModal(createServices(), { target: sinTaccWinter });

  await expect.element(dialog.getByRole("heading", { name: "Sin TACC de invierno" })).toBeVisible();
  await expect.element(dialog.getByText("Catálogo · Promociones", { exact: true })).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Sin TACC de invierno");
  await expect
    .element(dialog.getByRole("radio", { name: "Porcentaje de descuento" }))
    .toBeChecked();
  await expect.element(dialog.getByRole("radio", { name: "Distintivo" })).toBeChecked();
  await expect.element(dialog.getByRole("button", { name: /Sin TACC/ })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Descuento/ })).toHaveValue("20");
  expect(dateSegments(dialog, "Desde")).toEqual(["1", "12", "2026"]);
  expect(dateSegments(dialog, "Hasta")).toEqual(["28", "2", "2027"]);
  await expect
    .element(dialog.getByRole("button", { name: "Lunes" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect
    .element(dialog.getByRole("button", { name: "Martes" }))
    .toHaveAttribute("aria-pressed", "false");
  await expect
    .element(dialog.getByRole("button", { name: "Miércoles" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Guardar los cambios" })).toBeVisible();
});

test("shows the switch that applies it at the register, on, with its helper text", async () => {
  const { dialog } = await renderModal(createServices());

  await expect.element(dialog.getByRole("switch", { name: "Se aplica en la caja" })).toBeChecked();
  await expect
    .element(
      dialog.getByText(
        "Al desactivarla deja de aplicarse en las ventas nuevas; las ventas ya hechas no cambian.",
      ),
    )
    .toBeVisible();
});

test("shows the switch off for a deactivated promotion", async () => {
  const { dialog } = await renderModal(createServices(), { target: switchedOffPromotion });

  await expect
    .element(dialog.getByRole("switch", { name: "Se aplica en la caja" }))
    .not.toBeChecked();
});

test("saves the promotion untouched with its loaded version and reports the saved one", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "ok", discount: yerbaOff });
  const onSaved = vi.fn();
  const { dialog } = await renderModal(services, { onSaved });

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editDiscount).mock.calls.length).toBe(1);
  expect(services.editDiscount).toHaveBeenCalledWith(yerbaOff.id, {
    name: "Yerba de septiembre",
    benefit: { kind: "PERCENT_OFF", percent: 15 },
    target: { kind: "PRODUCT", id: yerbaProduct.id },
    validFrom: "2026-09-12",
    validTo: "2026-09-30",
    weekdays: [],
    version: 1,
    active: true,
  });
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
  expect(onSaved).toHaveBeenCalledWith(yerbaOff);
});

test("shows a buy-N-pay-M promotion with its product and quantities filled in", async () => {
  const { dialog } = await renderModal(createServices(), { target: yerbaThreeForTwo });

  await expect.element(dialog.getByRole("radio", { name: "Lleve N, pague M" })).toBeChecked();
  await expect.element(dialog.getByText("Producto y grupo")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: /Yerba Playadito 1 kg/ })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Lleve/ })).toHaveValue("3");
  await expect.element(dialog.getByRole("textbox", { name: /^Pague/ })).toHaveValue("2");
  expect(dialog.getByRole("textbox", { name: /^Descuento/ }).query()).toBeNull();
});

test("saves a buy-N-pay-M promotion untouched with its quantities and loaded version", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "ok", discount: yerbaThreeForTwo });
  const { dialog } = await renderModal(services, { target: yerbaThreeForTwo });

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editDiscount).mock.calls.length).toBe(1);
  expect(services.editDiscount).toHaveBeenCalledWith(yerbaThreeForTwo.id, {
    name: "Yerba 3x2",
    benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
    target: { kind: "PRODUCT", id: yerbaProduct.id },
    validFrom: "2026-09-15",
    validTo: "2026-10-15",
    weekdays: [],
    version: 2,
    active: true,
  });
});

test("turning a percentage promotion into buy-N-pay-M sends the quantities on the same product", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "ok", discount: yerbaThreeForTwo });
  const { dialog } = await renderModal(services);

  await chooseBuyNPayM(dialog);
  await fillQuantities(dialog, "4", "3");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editDiscount).mock.calls.length).toBe(1);
  expect(vi.mocked(services.editDiscount).mock.calls[0]?.[1]).toMatchObject({
    benefit: { kind: "BUY_N_PAY_M", buyQty: 4, payQty: 3 },
    target: { kind: "PRODUCT", id: yerbaProduct.id },
  });
});

test("says a product that is now sold by weight cannot take it, on the picker", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "target_not_sold_by_unit" });
  const { dialog } = await renderModal(services);

  await chooseBuyNPayM(dialog);
  await fillQuantities(dialog, "3", "2");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByRole("button", { name: /Yerba Playadito 1 kg/ }))
    .toHaveAccessibleDescription("Se vende por peso. Elegí otro producto.");
});

test("keeps the product sold by weight selected on its buy-N-pay-M promotion, tagged, with a help text", async () => {
  const { dialog } = await renderModal(createServices(), { target: almondsThreeForTwo });

  const picker = dialog.getByRole("button", { name: /Almendras peladas/ });
  await expect.element(picker).toBeVisible();
  await expect.element(picker.getByText("Por peso")).toBeVisible();
  await expect
    .element(picker)
    .toHaveAccessibleDescription(
      "Este producto se vende por peso: Lleve N, pague M no se le aplica.",
    );
});

test("names on the picker the product sold by weight when switching its promotion on, instead of the help text", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({
    kind: "product_sold_by_weight",
    productName: "Almendras peladas",
  });
  const { dialog } = await renderModal(services, { target: almondsThreeForTwo });

  await userEvent.click(dialog.getByText("Se aplica en la caja"));
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  const picker = dialog.getByRole("button", { name: /Almendras peladas/ });
  await expect
    .element(picker)
    .toHaveAccessibleDescription(
      '"Almendras peladas" se vende por peso: esta promoción solo aplica a productos por unidad.',
    );
  await expect.element(picker.getByText("Por peso")).toBeVisible();
  expect(
    dialog.getByText("Este producto se vende por peso: Lleve N, pague M no se le aplica.").query(),
  ).toBeNull();
});

test("switching the promotion off is sent with the rest of the form", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "ok", discount: yerbaOff });
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByText("Se aplica en la caja"));
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editDiscount).mock.calls.length).toBe(1);
  expect(vi.mocked(services.editDiscount).mock.calls[0]?.[1]).toMatchObject({
    active: false,
    version: 1,
  });
});

test("switching a deactivated promotion on is sent as active", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({
    kind: "ok",
    discount: switchedOffPromotion,
  });
  const { dialog } = await renderModal(services, { target: switchedOffPromotion });

  await userEvent.click(dialog.getByText("Se aplica en la caja"));
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editDiscount).mock.calls.length).toBe(1);
  expect(vi.mocked(services.editDiscount).mock.calls[0]?.[1]).toMatchObject({
    active: true,
    version: 4,
  });
});

test("sends the changes made to the name, the percentage, the dates and the weekdays", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "ok", discount: yerbaOff });
  const { dialog } = await renderModal(services, { target: almacenTuesdays });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Miércoles de almacén");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Descuento/ }), "25");
  await typeDate(dialog, "Hasta", "15112026");
  await userEvent.click(dialog.getByRole("button", { name: "Martes" }));
  await userEvent.click(dialog.getByRole("button", { name: "Miércoles" }));
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editDiscount).mock.calls.length).toBe(1);
  expect(services.editDiscount).toHaveBeenCalledWith(almacenTuesdays.id, {
    name: "Miércoles de almacén",
    benefit: { kind: "PERCENT_OFF", percent: 25 },
    target: { kind: "CATEGORY", id: almacenCategory.id },
    validFrom: "2026-10-01",
    validTo: "2026-11-15",
    weekdays: [3],
    version: 3,
    active: true,
  });
});

test("changing what it applies to clears the target until another one is chosen", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "ok", discount: yerbaOff });
  const { dialog } = await renderModal(services);

  await userEvent.click(radioLabel(dialog, "Categoría"));
  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Elegí una categoría.")).toBeVisible();
  expect(services.editDiscount).not.toHaveBeenCalled();

  await chooseTarget(dialog, "Elegí una categoría", "Almacén › Yerbas");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editDiscount).mock.calls.length).toBe(1);
  expect(vi.mocked(services.editDiscount).mock.calls[0]?.[1].target).toEqual({
    kind: "CATEGORY",
    id: yerbasCategory.id,
  });
});

test("an inactive current product still shows as the chosen value, marked inactive", async () => {
  const onRetired = {
    ...yerbaOff,
    target: { kind: "PRODUCT" as const, id: retiredProduct.id, name: "Café en grano" },
  };
  const { dialog } = await renderModal(createServices(), { target: onRetired });

  await expect.element(dialog.getByRole("button", { name: /Café en grano/ })).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: /Café en grano/ }));
  await expect.element(dialog.getByRole("option", { name: /Café en grano/ })).toBeVisible();
  await expect
    .element(dialog.getByRole("option", { name: /Café en grano/ }).getByText("Inactivo"))
    .toBeVisible();
});

test("an inactive current tag still shows as the chosen value, marked inactive", async () => {
  const onRetired = {
    ...sinTaccWinter,
    target: { kind: "TAG" as const, id: retiredTag.id, name: "Sin colorantes" },
  };
  const { dialog } = await renderModal(createServices(), { target: onRetired });

  await userEvent.click(dialog.getByRole("button", { name: /Sin colorantes/ }));

  await expect
    .element(dialog.getByRole("option", { name: /Sin colorantes/ }).getByText("Inactivo"))
    .toBeVisible();
});

test("an inactive current target saves as is when nothing about it changes", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "ok", discount: yerbaOff });
  const onRetired = {
    ...yerbaOff,
    target: { kind: "PRODUCT" as const, id: retiredProduct.id, name: "Café en grano" },
  };
  const { dialog } = await renderModal(services, { target: onRetired });

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editDiscount).mock.calls.length).toBe(1);
  expect(vi.mocked(services.editDiscount).mock.calls[0]?.[1].target.id).toBe(retiredProduct.id);
});

test("turning a percentage promotion on a product sold by weight into buy-N-pay-M does not offer that product", async () => {
  const onAlmonds = {
    ...yerbaOff,
    target: { kind: "PRODUCT" as const, id: almondsProduct.id, name: almondsProduct.name },
  };
  const { dialog } = await renderModal(createServices(), { target: onAlmonds });

  await chooseBuyNPayM(dialog);
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí un producto/ }));

  await expect.element(dialog.getByRole("option", { name: /Yerba Playadito 1 kg/ })).toBeVisible();
  expect(dialog.getByRole("option", { name: /Almendras peladas/ }).query()).toBeNull();
});

test("shows each field's message for what was cleared, without calling the cloud", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Descuento/ }), "150");
  await typeDate(dialog, "Hasta", "01092026");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ingresá el nombre de la promoción.")).toBeVisible();
  await expect
    .element(dialog.getByText("Ingresá un porcentaje entero entre 1 y 99."))
    .toBeVisible();
  await expect
    .element(dialog.getByText("La fecha de fin no puede ser anterior a la de inicio."))
    .toBeVisible();
  expect(services.editDiscount).not.toHaveBeenCalled();
});

test("puts the message the cloud names on that field", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({
    kind: "validation_failed",
    field: "validTo",
  });
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText("La fecha de fin no puede ser anterior a la de inicio."))
    .toBeVisible();
});

test.each([
  [yerbaOff, "Ya no está disponible. Elegí otro producto."],
  [almacenTuesdays, "Ya no está disponible. Elegí otra categoría."],
  [sinTaccWinter, "Ya no está disponible. Elegí otro distintivo."],
])(
  "says the target of %#'s kind is unavailable when the cloud can't find it",
  async (target, message) => {
    const services = createServices();
    vi.mocked(services.editDiscount).mockResolvedValue({ kind: "target_not_found" });
    const { dialog } = await renderModal(services, { target });

    await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

    await expect.element(dialog.getByText(message)).toBeVisible();
  },
);

test("tells the promotion changed while editing, and reloading refills the form from the read again", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "stale_version" });
  const reload = vi.fn().mockResolvedValue({
    kind: "found",
    discount: {
      ...yerbaOff,
      name: "Yerba renombrada",
      version: 5,
      benefit: { kind: "PERCENT_OFF", percent: 30 },
    },
  });
  const { dialog } = await renderModal(services, { reload });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect
    .element(dialog.getByText("Esta promoción cambió mientras la editabas"))
    .toBeVisible();
  await expect
    .element(dialog.getByText("Recargá sus datos y volvé a hacer el cambio."))
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  expect(reload).toHaveBeenCalledWith(yerbaOff.id);
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Yerba renombrada");
  await expect.element(dialog.getByRole("textbox", { name: /^Descuento/ })).toHaveValue("30");
  expect(dialog.getByText("Esta promoción cambió mientras la editabas").query()).toBeNull();

  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "ok", discount: yerbaOff });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.poll(() => vi.mocked(services.editDiscount).mock.calls.length).toBe(2);
  expect(vi.mocked(services.editDiscount).mock.calls[1]?.[1]).toMatchObject({ version: 5 });
});

test("says the promotion no longer exists when reloading does not find it", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "stale_version" });
  const reload = vi.fn().mockResolvedValue({ kind: "not_found" });
  const { dialog } = await renderModal(services, { reload });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(dialog.getByText("Esta promoción ya no existe").first()).toBeVisible();
});

test("says the promotion no longer exists when the cloud does not find it", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "not_found" });
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Esta promoción ya no existe").first()).toBeVisible();
});

test("ends the session when the cloud finds none open", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("sends the user to Mi cuenta when the cloud refuses the permission", async () => {
  window.history.pushState(null, "", "/discounts");
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "forbidden" });
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});

test("shows the rate-limited notice with the time to wait", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows a failure notice and keeps what was changed when the attempt fails", async () => {
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Otro nombre");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("No se guardó la promoción")).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("Otro nombre");
});

test("cancel closes the modal", async () => {
  const onClose = vi.fn();
  const { dialog } = await renderModal(createServices(), { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
});

test("opening another promotion replaces what was typed with its values", async () => {
  const { dialog, rerender } = await renderModal(createServices());
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Cambiado");

  await rerender({ target: almacenTuesdays });

  await expect
    .element(page.getByRole("dialog").getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Martes de almacén");
});

test("renders nothing while no promotion is being edited", async () => {
  const screen = await render(modalElement(createServices(), { target: null }));

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("has no accessibility violations", async () => {
  const { dialog } = await renderModal(createServices(), { target: sinTaccWinter });

  await expectNoAccessibilityViolations(dialog.element());
});

test("has no accessibility violations on a buy-N-pay-M promotion", async () => {
  const { dialog } = await renderModal(createServices(), { target: yerbaThreeForTwo });
  await expect.element(dialog.getByText("Producto y grupo")).toBeVisible();

  await expectNoAccessibilityViolations(dialog.element());
});

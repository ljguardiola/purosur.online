import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { discountsListFilters } from "./routes";
import {
  almacenTuesdays,
  discountList,
  switchedOffPromotion,
  yerbaOff,
} from "./test-support/discounts";
import {
  createServices,
  loaded,
  renderScreen,
  rowCells,
} from "./test-support/discounts-list-screen";

test("every promotion has an edit action named after it", async () => {
  const services = createServices();
  const screen = await loaded(services, [yerbaOff, almacenTuesdays]);

  await expect
    .element(screen.getByRole("button", { name: "Editar la promoción Yerba de septiembre" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Editar la promoción Martes de almacén" }))
    .toBeVisible();
});

test("the edit action opens that promotion's modal, and the saved changes are listed with a notice", async () => {
  await page.viewport(1280, 1200);
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "ok", discount: yerbaOff });
  const screen = await loaded(services, [yerbaOff]);

  await userEvent.click(
    screen.getByRole("button", { name: "Editar la promoción Yerba de septiembre" }),
  );
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Yerba de septiembre" })).toBeVisible();
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Yerba de primavera");
  vi.mocked(services.fetchDiscounts).mockResolvedValue({
    kind: "ok",
    value: discountList([{ ...yerbaOff, name: "Yerba de primavera", version: 2 }]),
  });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  expect(services.editDiscount).toHaveBeenCalledWith(
    yerbaOff.id,
    expect.objectContaining({ name: "Yerba de primavera", version: 1, active: true }),
  );
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Yerba de primavera").first()).toBeVisible();
  await expect.element(screen.getByText("Promoción actualizada")).toBeVisible();
  await expect
    .element(screen.getByText("Se guardaron los cambios de «Yerba de septiembre»."))
    .toBeVisible();
});

test("switching a promotion off from its modal lists it as deactivated", async () => {
  await page.viewport(1280, 1200);
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({
    kind: "ok",
    discount: { ...yerbaOff, active: false, version: 2 },
  });
  const screen = await loaded(services, [yerbaOff], {
    filters: discountsListFilters.parse({ status: "all" }),
  });
  await expect.poll(() => rowCells(screen).map((cells) => cells.at(-1))).toEqual(["Vigente"]);

  await userEvent.click(
    screen.getByRole("button", { name: "Editar la promoción Yerba de septiembre" }),
  );
  const dialog = screen.getByRole("dialog");
  vi.mocked(services.fetchDiscounts).mockResolvedValue({
    kind: "ok",
    value: discountList([{ ...yerbaOff, active: false, version: 2 }]),
  });
  await userEvent.click(dialog.getByText("Se aplica en la caja"));
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => rowCells(screen).map((cells) => cells.at(-1))).toEqual(["Desactivada"]);
});

test("a deactivated promotion opens with its switch off", async () => {
  await page.viewport(1280, 1200);
  const services = createServices();
  const screen = await loaded(services, [switchedOffPromotion], {
    filters: discountsListFilters.parse({ status: "all" }),
  });

  await userEvent.click(screen.getByRole("button", { name: "Editar la promoción Aceite apagado" }));

  await expect
    .element(screen.getByRole("dialog").getByRole("switch", { name: "Se aplica en la caja" }))
    .not.toBeChecked();
});

test("a stale version's reload refills the edit modal from the list read again", async () => {
  await page.viewport(1280, 1200);
  const services = createServices();
  vi.mocked(services.editDiscount).mockResolvedValue({ kind: "stale_version" });
  const screen = await loaded(services, [yerbaOff]);
  await userEvent.click(
    screen.getByRole("button", { name: "Editar la promoción Yerba de septiembre" }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect
    .element(dialog.getByText("Esta promoción cambió mientras la editabas"))
    .toBeVisible();
  vi.mocked(services.fetchDiscounts).mockResolvedValue({
    kind: "ok",
    value: discountList([{ ...yerbaOff, name: "Yerba renombrada", version: 5 }]),
  });

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Yerba renombrada");
});

test("the edit modal offers what the screen read: an inactive product stays as the current value", async () => {
  await page.viewport(1280, 1200);
  const services = createServices();
  const onInactive = {
    ...yerbaOff,
    target: {
      ...yerbaOff.target,
      id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000105",
      name: "Café en grano",
    },
  };
  const screen = await loaded(services, [onInactive]);

  await userEvent.click(
    screen.getByRole("button", { name: "Editar la promoción Yerba de septiembre" }),
  );

  await expect
    .element(screen.getByRole("dialog").getByRole("button", { name: /Café en grano/ }))
    .toBeVisible();
});

test("shows no edit modal while the promotions are not loaded", async () => {
  const services = createServices();
  vi.mocked(services.fetchDiscounts).mockResolvedValue({ kind: "failed" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir las promociones")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

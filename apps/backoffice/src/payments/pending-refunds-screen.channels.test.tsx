import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  allChannels,
  createPendingRefundsServices,
  FRONT_REGISTER_ID,
  mercadoPagoChannel,
  renderPendingRefunds,
  rowTexts,
  withoutApiChannel,
} from "./test-support/pending-refunds-screen";
import { pendingRefundsOfBothKinds } from "./test-support/refund-fixtures";

const MERCADO_PAGO_FOOTER =
  "Los reembolsos con QR o Point de ventas canceladas, y con QR de aprobaciones tardías, se envían a Mercado Pago recién cuando se confirman acá. Los de ventas anuladas con QR o Point los confirmó en la caja quien anuló la venta, y se envían sin pasar por acá.";
const WITHOUT_API_FOOTER = "Se hacen fuera del sistema y acá se marcan como hechos.";

async function loadedWithBothKinds(
  options?: Parameters<typeof renderPendingRefunds>[2],
  onSessionEnded = () => {},
) {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsOfBothKinds,
  });
  const screen = await renderPendingRefunds(services, onSessionEnded, options);
  await expect.poll(() => rowTexts(screen).length).toBeGreaterThan(0);
  return { screen, services };
}

function optionTexts(screen: Awaited<ReturnType<typeof renderPendingRefunds>>) {
  return screen
    .getByRole("option")
    .all()
    .map((option) => option.element().textContent?.trim());
}

test("lists the refunds of both channels by default, each row with the actions of its own channel", async () => {
  const { screen } = await loadedWithBothKinds();

  await expect.poll(() => rowTexts(screen)).toHaveLength(4);
  await expect.element(screen.getByRole("button", { name: /^Canal/ })).toHaveTextContent("Todos");
  await expect
    .element(
      screen.getByRole("button", { name: "Enviar a Mercado Pago el reembolso de $ 3.400,00" }),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 2.500,00" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 980,00" }))
    .toBeVisible();
  expect(
    screen
      .getByRole("button", { name: "Enviar a Mercado Pago el reembolso de $ 2.500,00" })
      .query(),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 3.400,00" }).query(),
  ).toBeNull();
});

test("offers the channels all, Mercado Pago and without an API", async () => {
  const { screen } = await loadedWithBothKinds();

  await screen.getByRole("button", { name: /^Canal/ }).click();

  expect(optionTexts(screen)).toEqual(["Todos", "Mercado Pago", "Sin API"]);
});

test("choosing the channel Sin API lists only the refunds without an API, with their actions", async () => {
  const onFiltersChange = vi.fn();
  const { screen } = await loadedWithBothKinds({ onFiltersChange });
  await screen.getByRole("button", { name: /^Canal/ }).click();

  await userEvent.click(screen.getByRole("option", { name: "Sin API" }));

  await expect.poll(() => screen.getByText("$ 3.400,00", { exact: true }).query()).toBeNull();
  expect(screen.getByText("$ 1.250,00", { exact: true }).query()).toBeNull();
  await expect.element(screen.getByText("$ 2.500,00", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("$ 980,00", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Marcar como hecho el reembolso de $ 2.500,00" }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: /^Enviar a Mercado Pago/ }).all()).toHaveLength(0);
  expect(onFiltersChange).toHaveBeenLastCalledWith({
    channel: "without-api",
    register: "all",
    method: "all",
  });
});

test("choosing the channel Mercado Pago lists only the refunds Mercado Pago sends, with their actions", async () => {
  const onFiltersChange = vi.fn();
  const { screen } = await loadedWithBothKinds({ onFiltersChange });
  await screen.getByRole("button", { name: /^Canal/ }).click();

  await userEvent.click(screen.getByRole("option", { name: "Mercado Pago" }));

  await expect.poll(() => screen.getByText("$ 2.500,00", { exact: true }).query()).toBeNull();
  expect(screen.getByText("$ 980,00", { exact: true }).query()).toBeNull();
  await expect.element(screen.getByText("$ 3.400,00", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();
  expect(screen.getByRole("button", { name: /^Marcar como hecho/ }).all()).toHaveLength(0);
  expect(onFiltersChange).toHaveBeenLastCalledWith({
    channel: "mercado-pago",
    register: "all",
    method: "all",
  });
});

test("opens on the channel the address carries", async () => {
  const { screen } = await loadedWithBothKinds({ filters: withoutApiChannel });

  await expect.element(screen.getByRole("button", { name: /^Canal/ })).toHaveTextContent("Sin API");
  expect(screen.getByText("$ 3.400,00", { exact: true }).query()).toBeNull();
});

test("offers the registers of the refunds of the chosen channel only", async () => {
  const { screen } = await loadedWithBothKinds({ filters: mercadoPagoChannel });

  await screen.getByRole("combobox", { name: /^Caja/ }).click();
  expect(optionTexts(screen)).toEqual(["Todas", "Caja de la entrada", "Caja del frente"]);
});

test("goes back to every register when the channel chosen has none for the register chosen", async () => {
  const onFiltersChange = vi.fn();
  const { screen } = await loadedWithBothKinds({
    filters: { ...allChannels, register: "22222222-2222-4222-8222-222222222222" },
    onFiltersChange,
  });
  await expect.poll(() => rowTexts(screen)).toHaveLength(1);

  await screen.getByRole("button", { name: /^Canal/ }).click();
  await userEvent.click(screen.getByRole("option", { name: "Mercado Pago" }));

  await expect
    .poll(() => onFiltersChange.mock.lastCall)
    .toEqual([{ channel: "mercado-pago", register: "all", method: "all" }]);
  await expect.poll(() => rowTexts(screen)).toHaveLength(2);
});

test("combines the channel with the register", async () => {
  const { screen } = await loadedWithBothKinds({
    filters: { ...mercadoPagoChannel, register: FRONT_REGISTER_ID },
  });

  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();
  expect(screen.getByText("$ 3.400,00", { exact: true }).query()).toBeNull();
  expect(rowTexts(screen)).toHaveLength(1);
});

test("shows the blank empty state when the chosen channel has no pending refund at all, even if the other has", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: { refunds: pendingRefundsOfBothKinds.refunds.filter((refund) => !refund.sent_by_cloud) },
  });

  const screen = await renderPendingRefunds(services, () => {}, { filters: mercadoPagoChannel });

  await expect
    .element(screen.getByText("Sin reembolsos pendientes", { exact: true }))
    .toBeVisible();
  expect(screen.getByText("No hay reembolsos pendientes con estos filtros").query()).toBeNull();
});

test("shows the filtered empty state when the register chosen hides every refund of the channel", async () => {
  const { screen } = await loadedWithBothKinds({
    filters: {
      ...withoutApiChannel,
      register: "11111111-1111-4111-8111-111111111111",
      method: "POINT",
    },
  });

  await expect
    .element(screen.getByText("No hay reembolsos pendientes con estos filtros"))
    .toBeVisible();
  await expect
    .element(screen.getByText("Probá con otro canal, otra caja o otro medio."))
    .toBeVisible();
});

test("explains under the table both channels when all are listed", async () => {
  const { screen } = await loadedWithBothKinds();

  await expect.element(screen.getByText(MERCADO_PAGO_FOOTER)).toBeVisible();
  await expect.element(screen.getByText(WITHOUT_API_FOOTER)).toBeVisible();
});

test("explains under the table only Mercado Pago's channel when it is the one chosen", async () => {
  const { screen } = await loadedWithBothKinds({ filters: mercadoPagoChannel });

  await expect.element(screen.getByText(MERCADO_PAGO_FOOTER)).toBeVisible();
  expect(screen.getByText(WITHOUT_API_FOOTER).query()).toBeNull();
});

test("explains under the table only the channel without an API when it is the one chosen", async () => {
  const { screen } = await loadedWithBothKinds({ filters: withoutApiChannel });

  await expect.element(screen.getByText(WITHOUT_API_FOOTER)).toBeVisible();
  expect(screen.getByText(MERCADO_PAGO_FOOTER).query()).toBeNull();
});

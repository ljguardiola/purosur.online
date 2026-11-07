import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { createQueryClient } from "../platform/query-client";
import { deferred } from "../platform/test-support/deferred";
import { render } from "../shell/test-support/render-with-router";
import { PendingRefundsScreen } from "./pending-refunds-screen";
import type { PendingRefundsScreenServices } from "./pending-refunds-services";
import {
  createPendingRefundsServices,
  FRONT_REGISTER_ID,
  mercadoPagoChannel,
  type RenderPendingRefundsOptions,
  renderPendingRefunds,
  rowTexts,
} from "./test-support/pending-refunds-screen";
import {
  CLOUD_SENT_REFUND_ID,
  LATE_PAYMENT_REFUND_ID,
  noPendingRefunds,
  pendingRefunds,
  pendingRefundsOfEveryCloudRefundStage,
  pendingRefundsOfTwoMercadoPagoRegisters,
  pendingRefundsOfVoidedSalePaidThroughMercadoPago,
  pendingRefundsWithConfirmedLatePayment,
  pendingRefundsWithLatePayment,
  pendingRefundsWithLatePaymentOfOtherOrder,
  pendingRefundsWithLatePointPayment,
  pendingRefundsWithSurplusOfRebuiltSale,
  pendingRefundsWithUnconfirmedCloudRefund,
  pendingRefundsWithUnconfirmedPointRefund,
} from "./test-support/refund-fixtures";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function renderScreen(
  services: PendingRefundsScreenServices,
  onSessionEnded = () => {},
  { filters = mercadoPagoChannel, onFiltersChange }: RenderPendingRefundsOptions = {},
) {
  return renderPendingRefunds(services, onSessionEnded, {
    filters,
    ...(onFiltersChange ? { onFiltersChange } : {}),
  });
}

async function loaded(services: PendingRefundsScreenServices) {
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithLatePayment,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();
  return screen;
}

test("shows each Mercado Pago refund with since when, why, how, how much", async () => {
  const services = createPendingRefundsServices();
  const screen = await loaded(services);

  await expect.element(screen.getByRole("table", { name: "Reembolsos pendientes" })).toBeVisible();
  const rows = rowTexts(screen);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toContain("08/10/2026");
  expect(rows[0]).toContain("hace 27 horas");
  expect(rows[0]).toContain("Aprobación tardía");
  expect(rows[0]).toContain(
    "El QR de la venta del 08/10 09:37 se pagó después de cobrarla con transferencia",
  );
  expect(rows[0]).toContain("QR de Mercado Pago");
  expect(rows[0]).toContain("Sin confirmar");
  expect(rows[0]).toContain("$ 1.250,00");
  await expectNoAccessibilityViolations(screen.container);
});

test("heads the list by since when, why, how and how much, with no column for the register", async () => {
  const services = createPendingRefundsServices();
  const screen = await loaded(services);

  const headers = screen
    .getByRole("columnheader")
    .all()
    .map((header) => header.element().textContent?.trim());
  expect(headers.slice(0, 4)).toEqual(["Pendiente desde", "Por qué", "Medio", "Importe"]);
  await expect.element(screen.getByRole("columnheader", { name: "Caja" })).not.toBeInTheDocument();
});

test("lists only the refunds Mercado Pago sends, leaving out the ones made outside the system", async () => {
  const services = createPendingRefundsServices();
  const screen = await loaded(services);

  expect(screen.getByText("$ 2.500,00", { exact: true }).query()).toBeNull();
});

test("leaves out a Point refund that is made outside the system", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithLatePointPayment,
  });

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByText("No hay reembolsos pendientes con estos filtros"))
    .toBeVisible();
  expect(screen.getByText("$ 760,00", { exact: true }).query()).toBeNull();
});

test("tells that a sale rebuilt against its paid order was charged more than its total", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithSurplusOfRebuiltSale,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("$ 400,00", { exact: true })).toBeVisible();

  const rows = rowTexts(screen);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toContain("La venta del 08/10 09:37 se armó con un cobro mayor a su total");
  expect(rows[0]).not.toContain("se pagó");
});

test("tells, in the method cell of a refund for a second paid order, the order Mercado Pago gave", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithLatePaymentOfOtherOrder,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("$ 1.180,00", { exact: true })).toBeVisible();

  const rows = rowTexts(screen);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toContain("Aprobación tardía");
  expect(rows[0]).toContain("Orden ORD01JQ4S4KY8HWQ6NA5PXB65B3D3");
  await expectNoAccessibilityViolations(screen.container);
});

test("explains under the table which refunds are sent only once confirmed here and which ones are sent without a step here", async () => {
  const services = createPendingRefundsServices();
  const screen = await loaded(services);

  await expect
    .element(
      screen.getByText(
        "Los reembolsos con QR o Point de ventas canceladas, y con QR de aprobaciones tardías, se envían a Mercado Pago recién cuando se confirman acá. Los de ventas anuladas con QR o Point los confirmó en la caja quien anuló la venta, y se envían sin pasar por acá.",
      ),
    )
    .toBeVisible();
});

test("filters the loaded refunds by the register that took them, offering only the registers of the listed refunds", async () => {
  const services = createPendingRefundsServices();
  const onFiltersChange = vi.fn();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsOfTwoMercadoPagoRegisters,
  });
  const screen = await renderScreen(services, () => {}, { onFiltersChange });
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();

  await screen.getByRole("combobox", { name: /^Caja/ }).click();
  const options = screen
    .getByRole("option")
    .all()
    .map((option) => option.element().textContent?.trim());
  expect(options).toEqual(["Todas", "Caja de la entrada", "Caja del frente"]);
  await userEvent.click(screen.getByRole("option", { name: "Caja del frente" }));

  await expect.poll(() => screen.getByText("$ 3.400,00", { exact: true }).query()).toBeNull();
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();
  expect(services.fetchPendingRefunds).toHaveBeenCalledTimes(1);
  expect(onFiltersChange).toHaveBeenLastCalledWith({
    channel: "mercado-pago",
    register: FRONT_REGISTER_ID,
    method: "all",
  });
});

test("opens on the register the address carries", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsOfTwoMercadoPagoRegisters,
  });

  const screen = await renderScreen(services, () => {}, {
    filters: { ...mercadoPagoChannel, register: FRONT_REGISTER_ID },
  });

  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();
  expect(screen.getByText("$ 3.400,00", { exact: true }).query()).toBeNull();
  await expect
    .element(screen.getByRole("combobox", { name: /^Caja/ }))
    .toHaveValue("Caja del frente");
});

test("shows every refund and reports every register when the address carries a register the list has none for", async () => {
  const services = createPendingRefundsServices();
  const onFiltersChange = vi.fn();
  const { promise, resolve } = deferred<Awaited<ReturnType<typeof services.fetchPendingRefunds>>>();
  vi.mocked(services.fetchPendingRefunds).mockReturnValue(promise);

  const screen = await renderScreen(services, () => {}, {
    filters: { ...mercadoPagoChannel, register: "99999999-0000-4000-8000-000000000000" },
    onFiltersChange,
  });
  expect(onFiltersChange).not.toHaveBeenCalled();
  resolve({ kind: "ok", value: pendingRefundsOfTwoMercadoPagoRegisters });

  await expect.element(screen.getByText("$ 3.400,00", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("combobox", { name: /^Caja/ })).toHaveValue("Todas");
  await expect
    .poll(() => onFiltersChange.mock.lastCall)
    .toEqual([{ channel: "mercado-pago", register: "all", method: "all" }]);
});

test("shows the filtered empty state when no Mercado Pago refund is pending while others are made outside the system", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefunds,
  });

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByText("No hay reembolsos pendientes con estos filtros"))
    .toBeVisible();
  expect(screen.getByText("Sin reembolsos pendientes", { exact: true }).query()).toBeNull();
});

test("shows the empty state when no refund is pending at all", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: noPendingRefunds,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Sin reembolsos pendientes")).toBeVisible();
});

test("shows the table loading while the refunds load", async () => {
  const services = createPendingRefundsServices();
  const firstLoad = deferred<Awaited<ReturnType<typeof services.fetchPendingRefunds>>>();
  vi.mocked(services.fetchPendingRefunds).mockReturnValueOnce(firstLoad.promise);

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Reembolsos pendientes" }))
    .toHaveAttribute("aria-busy", "true");
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createPendingRefundsServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchPendingRefunds>>>();
  vi.mocked(services.fetchPendingRefunds)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByText("No pudimos abrir los reembolsos pendientes"))
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Reembolsos pendientes" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: pendingRefundsWithLatePayment });
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("navigates to Mi cuenta when the refunds request comes back forbidden", async () => {
  window.history.pushState(null, "", "/refunds");
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("ends the session when the refunds request finds no open session", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("offers to send and to discard a late QR payment's refund, never to mark it done, while nobody confirmed it", async () => {
  const services = createPendingRefundsServices();
  const screen = await loaded(services);

  await expect
    .element(
      screen.getByRole("button", { name: "Enviar a Mercado Pago el reembolso de $ 1.250,00" }),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Descartar el reembolso de $ 1.250,00" }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: /^Marcar como hecho/ }).all()).toHaveLength(0);
  await expectNoAccessibilityViolations(screen.container);
});

test("offers neither sending nor discarding a late QR payment's refund once it was confirmed, and tells how far it got", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithConfirmedLatePayment,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();

  expect(screen.getByRole("button", { name: /1\.250,00/ }).all()).toHaveLength(0);
  await expect.element(screen.getByText("Enviado a Mercado Pago · en proceso")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("offers to send to Mercado Pago, and never to discard, the Point refund of a cancelled sale", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithUnconfirmedPointRefund,
  });
  const screen = await renderScreen(services);

  await expect
    .element(
      screen.getByRole("button", { name: "Enviar a Mercado Pago el reembolso de $ 5.400,00" }),
    )
    .toBeVisible();
  expect(screen.getByRole("button", { name: /^Descartar el reembolso/ }).all()).toHaveLength(0);
  expect(screen.getByRole("button", { name: /^Marcar como hecho/ }).all()).toHaveLength(0);
});

test("offers sending a QR refund of a cancelled sale to Mercado Pago", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithUnconfirmedCloudRefund,
  });
  const screen = await renderScreen(services);

  await expect
    .element(
      screen.getByRole("button", { name: "Enviar a Mercado Pago el reembolso de $ 3.400,00" }),
    )
    .toBeVisible();
  expect(screen.getByRole("button", { name: /^Marcar como hecho/ }).all()).toHaveLength(0);
  await expectNoAccessibilityViolations(screen.container);
});

test("tells how far each QR refund the cloud sends got, offering sending only the unconfirmed one and discarding only the one Mercado Pago refused for good", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsOfEveryCloudRefundStage,
  });
  const screen = await renderScreen(services);
  await expect.poll(() => screen.getByRole("row").all().length).toBe(6);

  const rows = rowTexts(screen);
  expect(rows[2]).toContain("Enviado a Mercado Pago · en proceso");
  expect(screen.getByRole("button", { name: /^Enviar a Mercado Pago/ }).all()).toHaveLength(1);
  expect(screen.getByRole("button", { name: /^Descartar el reembolso/ }).all()).toHaveLength(1);
  expect(rows[4]).toContain("Mercado Pago lo rechazó");
  await expectNoAccessibilityViolations(screen.container);
});

test("tells a voided sale's Mercado Pago refunds by their origin and how far they got, offering no action on them", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsOfVoidedSalePaidThroughMercadoPago,
  });
  const screen = await renderScreen(services);
  await expect.poll(() => screen.getByRole("row").all().length).toBe(3);

  const rows = rowTexts(screen);
  expect(rows[0]).toContain("Anulación de venta");
  expect(rows[0]).toContain("Confirmado · se envía al reconectar");
  expect(rows[1]).toContain("Anulación de venta");
  expect(rows[1]).toContain("Enviado a Mercado Pago · en proceso");
  expect(screen.getByRole("button", { name: /^Enviar a Mercado Pago/ }).all()).toHaveLength(0);
  expect(screen.getByRole("button", { name: /^Descartar el reembolso/ }).all()).toHaveLength(0);
  await expectNoAccessibilityViolations(screen.container);
});

test("discarding a refund asks first, then discards it and the refund leaves the list", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.discardRefund).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services);

  await userEvent.click(
    screen.getByRole("button", { name: "Descartar el reembolso de $ 1.250,00" }),
  );
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "¿Descartar el reembolso de $ 1.250,00?" }))
    .toBeVisible();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({ kind: "ok", value: pendingRefunds });
  await userEvent.click(dialog.getByRole("button", { name: "Descartar reembolso" }));

  expect(services.discardRefund).toHaveBeenCalledWith(LATE_PAYMENT_REFUND_ID);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => screen.getByText("$ 1.250,00", { exact: true }).query()).toBeNull();
});

test("discarding a refund reads the refunds again and leaves other concepts' data as it was", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithLatePayment,
  });
  vi.mocked(services.discardRefund).mockResolvedValue({ kind: "ok" });
  const queryClient = createQueryClient();
  const salesReportKey = ["sales", "report"];
  queryClient.setQueryData(salesReportKey, []);
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <FieldSizeProvider size="backoffice">
        <main>
          <PendingRefundsScreen
            services={services}
            onSessionEnded={() => {}}
            filters={mercadoPagoChannel}
            onFiltersChange={() => {}}
          />
        </main>
      </FieldSizeProvider>
    </QueryClientProvider>,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Descartar el reembolso de $ 1.250,00" }),
  );

  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Descartar reembolso" }),
  );

  await expect.poll(() => services.fetchPendingRefunds).toHaveBeenCalledTimes(2);
  expect(queryClient.getQueryState(salesReportKey)?.isInvalidated).toBe(false);
});

test("a refund another person already discarded leaves the list once the list is updated", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.discardRefund).mockResolvedValue({ kind: "already_discarded" });
  const screen = await loaded(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Descartar el reembolso de $ 1.250,00" }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Descartar reembolso" }));
  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba descartado");
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({ kind: "ok", value: pendingRefunds });

  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => screen.getByText("$ 1.250,00", { exact: true }).query()).toBeNull();
});

test("cancel closes the discard question and the refund stays listed", async () => {
  const services = createPendingRefundsServices();
  const screen = await loaded(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Descartar el reembolso de $ 1.250,00" }),
  );

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();
  expect(services.discardRefund).not.toHaveBeenCalled();
});

test("sending a refund asks first, then sends it, refreshes the list and tells Mercado Pago's answer", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds)
    .mockResolvedValueOnce({ kind: "ok", value: pendingRefundsWithUnconfirmedCloudRefund })
    .mockResolvedValue({ kind: "ok", value: pendingRefunds });
  vi.mocked(services.confirmRefund).mockResolvedValue({
    kind: "ok",
    value: { refund_id: CLOUD_SENT_REFUND_ID, outcome: "sent" },
  });
  const screen = await renderScreen(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Enviar a Mercado Pago el reembolso de $ 3.400,00" }),
  );

  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "¿Enviar el reembolso a Mercado Pago?" }))
    .toBeVisible();
  expect(services.confirmRefund).not.toHaveBeenCalled();
  await userEvent.click(dialog.getByRole("button", { name: "Enviar a Mercado Pago" }));

  expect(services.confirmRefund).toHaveBeenCalledWith(CLOUD_SENT_REFUND_ID);
  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Reembolso enviado a Mercado Pago")).toBeVisible();
  await expect.poll(() => vi.mocked(services.fetchPendingRefunds).mock.calls.length).toBe(2);
});

test("a refusal of the confirmation keeps the question open and refreshes nothing until the list is updated", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds)
    .mockResolvedValueOnce({ kind: "ok", value: pendingRefundsWithUnconfirmedCloudRefund })
    .mockResolvedValue({ kind: "ok", value: pendingRefunds });
  vi.mocked(services.confirmRefund).mockResolvedValue({ kind: "already_confirmed" });
  const screen = await renderScreen(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Enviar a Mercado Pago el reembolso de $ 3.400,00" }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Enviar a Mercado Pago" }));

  await expect
    .element(dialog.getByRole("alert"))
    .toHaveTextContent("Este reembolso ya estaba confirmado");
  expect(services.fetchPendingRefunds).toHaveBeenCalledTimes(1);
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  await expect.poll(() => vi.mocked(services.fetchPendingRefunds).mock.calls.length).toBe(2);
});

test("typing in the register filter offers only the matching registers", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsOfTwoMercadoPagoRegisters,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("$ 1.250,00", { exact: true })).toBeVisible();

  await userEvent.fill(screen.getByRole("combobox", { name: /^Caja/ }), "entr");

  expect(
    screen
      .getByRole("option")
      .all()
      .map((option) => option.element().textContent?.trim()),
  ).toEqual(["Caja de la entrada"]);
});

test("offers to give back by transfer only the refund Mercado Pago refused for good", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsOfEveryCloudRefundStage,
  });
  const screen = await renderScreen(services);
  await expect.poll(() => screen.getByRole("row").all().length).toBe(6);

  expect(
    screen
      .getByRole("button", { name: /^Registrar la devolución por transferencia del reembolso/ })
      .all(),
  ).toHaveLength(1);
  await expectNoAccessibilityViolations(screen.container);
});

test("recording a transfer asks first, then records it and reads the refunds again", async () => {
  const services = createPendingRefundsServices();
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsOfEveryCloudRefundStage,
  });
  vi.mocked(services.recordRefundTransfer).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.poll(() => screen.getByRole("row").all().length).toBe(6);

  await userEvent.click(
    screen.getByRole("button", {
      name: "Registrar la devolución por transferencia del reembolso de $ 3.400,00",
    }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: /Tipo de transferencia/ }));
  await userEvent.click(screen.getByRole("option", { name: "Transferencia bancaria" }));
  await userEvent.fill(dialog.getByRole("textbox", { name: /Número de operación/ }), "998877");
  vi.mocked(services.fetchPendingRefunds).mockClear();
  await userEvent.click(dialog.getByRole("button", { name: "Registrar transferencia" }));

  expect(services.recordRefundTransfer).toHaveBeenCalledWith(expect.any(String), {
    kind: "bank",
    operation_number: "998877",
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchPendingRefunds).mock.calls.length).toBe(1);
});
